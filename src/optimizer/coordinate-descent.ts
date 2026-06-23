import type { MapConfig, Monster, OptimizationTarget, OptimizationResult, SimulationResult } from '../types';
import { WorkerPool } from '../workers/worker-pool';

/** 优化用模拟次数 */
const OPT_TRIALS = 8000;

/** 单点 timeWeight 搜索的最大范围 */
const TW_MAX = 12.0;

/** 获取优化用的数据源 */
function getOptData(result: SimulationResult, pool: 'indoor' | 'outdoor', dataMode: 'count' | 'prob'): number[][] {
  if (dataMode === 'prob') {
    return pool === 'indoor' ? result.indoorSpawnProb : result.outdoorSpawnProb;
  }
  return pool === 'indoor' ? result.indoorExpected : result.outdoorExpected;
}

/** 将模拟原始值转为与目标同比的显示值（prob模式下 ×100 转百分比） */
function toDisplayValue(raw: number, dataMode: 'count' | 'prob'): number {
  return dataMode === 'prob' ? raw * 100 : raw;
}

/** 计算 RMSE */
function calcRMSE(targets: OptimizationTarget[], result: SimulationResult): number {
  let sumSq = 0;
  let count = 0;

  for (const target of targets) {
    const data = getOptData(result, target.pool, target.dataMode);
    for (const { wave, value } of target.targets) {
      if (wave < data.length) {
        const displayVal = toDisplayValue(data[wave][target.monsterIdx], target.dataMode);
        const diff = displayVal - value;
        sumSq += diff * diff;
        count++;
      }
    }
  }

  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

/** 检测不可达目标（genProb=0 的怪物无法生成） */
export function getUnreachableWaves(
  targets: OptimizationTarget[],
  mapConfig: MapConfig,
  monsters: Monster[]
): { monsterIdx: number; pool: string; wave: number; reason: string }[] {
  const unreachable: { monsterIdx: number; pool: string; wave: number; reason: string }[] = [];

  for (const target of targets) {
    const genProb = mapConfig.genProb[target.monsterIdx];
    if (genProb <= 0) {
      for (const { wave } of target.targets) {
        unreachable.push({ monsterIdx: target.monsterIdx, pool: target.pool, wave, reason: 'gen_prob=0' });
      }
    }
  }

  return unreachable;
}

/** 对单个目标的 timeWeight 进行搜索优化 */
async function optimizeTimeWeight(
  monsterIdx: number,
  wave: number,
  targetValue: number,
  pool: 'indoor' | 'outdoor',
  dataMode: 'count' | 'prob',
  workingMonsters: Monster[],
  workingMapConfig: MapConfig,
  workerPool: WorkerPool,
  seed: number
): Promise<{ bestVal: number; reachable: boolean; maxReachable: number }> {
  const monster = workingMonsters[monsterIdx];
  const oldVal = monster.timeWeight[wave];

  /** 跑一次模拟并返回与目标同比的显示值 */
  const testOne = async (tw: number): Promise<number> => {
    monster.timeWeight[wave] = tw;
    await workerPool.reinit([workingMapConfig], workingMonsters);
    const r = await workerPool.optimizationRun(workingMapConfig.mapId, OPT_TRIALS, seed);
    const data = getOptData(r, pool, dataMode);
    return toDisplayValue(data[wave]?.[monsterIdx] ?? 0, dataMode);
  };

  // ═══ 第0步：先测原值，以此为基准 ═══
  // 之前的 bug: bestError=Infinity 导致第一个样本必赢，oldVal 从未被测
  const oldDisplay = await testOne(oldVal);
  let bestVal = oldVal;
  let bestError = Math.abs(oldDisplay - targetValue);

  // ═══ 第1步：上限探测 ═══
  const extremes = [
    { val: 0, label: 'min' },
    { val: TW_MAX, label: 'max' },
  ];
  const extremeResults: { val: number; testValue: number }[] = [];
  for (const { val } of extremes) {
    extremeResults.push({ val, testValue: await testOne(val) });
  }

  // 如果极端值都没效果（max≈0），则该波次完全不可达
  const maxReachable = extremeResults[1].testValue;
  if (maxReachable <= 0.01) {
    const minVal = extremeResults[0].testValue;
    const reason = minVal > 0
      ? `已达maxNum上限(累积值${minVal.toFixed(1)}不变)`
      : `genProb=0或完全无法生成`;
    console.log(`[优化器] ⊘ monster=${monsterIdx} w${wave} (${dataMode}): ${reason}`);
    monster.timeWeight[wave] = oldVal;
    return { bestVal: oldVal, reachable: false, maxReachable: 0 };
  }

  // 目标值超过可达上限，仍尝试优化（推至 TW_MAX），但不标记为不可达
  if (targetValue > maxReachable * 2.0) {
    console.log(`[优化器] ⚠ 目标 ${targetValue.toFixed(1)} 远超上限 ${maxReachable.toFixed(2)} (monster=${monsterIdx} w${wave})，尽力逼近`);
  }

  // ═══ 第2步：粗搜 ═══
  const samples = [0, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, TW_MAX];
  for (const s of samples) {
    const testValue = await testOne(s);
    const testError = Math.abs(testValue - targetValue);
    if (testError < bestError) {
      bestError = testError;
      bestVal = s;
    }
  }

  // ═══ 第3步：精搜（二分） ═══
  let lo = 0;
  let hi = TW_MAX;

  for (let iter = 0; iter < 16; iter++) {
    const mid = (lo + hi) / 2;
    const testValue = await testOne(mid);
    const testError = Math.abs(testValue - targetValue);

    if (testError < bestError) {
      bestError = testError;
      bestVal = mid;
    }

    // prob 模式收敛阈值放宽（百分比1位精度）
    if (Math.abs(testValue - targetValue) < (dataMode === 'prob' ? 0.5 : 0.05)) break;
    if (Math.abs(hi - lo) < 0.005) break;

    if (testValue < targetValue) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // ═══ 第4步：后置守卫 ═══
  // count 模式：累积值只能增不能减，timeWeight=0 无法消除前序波次累积
  // prob 模式：每波独立，timeWeight 直接生效，不需要守卫
  if (dataMode === 'count' && bestVal < 0.01 && oldVal > 0.01) {
    const minReachable = extremeResults[0].testValue;
    if (minReachable > targetValue * 0.8 && minReachable > 0.1) {
      console.log(
        `[优化器] ⛔ w${wave}: 归零无效(timeWeight=0时累积${minReachable.toFixed(2)}>目标${targetValue.toFixed(1)})，保持原值(需调前序波次)`
      );
      monster.timeWeight[wave] = oldVal;
      return { bestVal: oldVal, reachable: true, maxReachable };
    }
  }

  // 应用最优值
  monster.timeWeight[wave] = bestVal;
  return { bestVal, reachable: true, maxReachable };
}

export class Optimizer {
  private workerPool: WorkerPool;
  private mapConfig: MapConfig;
  private monsters: Monster[];

  constructor(workerPool: WorkerPool, mapConfig: MapConfig, monsters: Monster[]) {
    this.workerPool = workerPool;
    this.mapConfig = mapConfig;
    this.monsters = monsters;
  }

  async optimize(
    targets: OptimizationTarget[],
    onProgress?: (p: number) => void
  ): Promise<OptimizationResult> {
    // 先收集所有有目标的怪物（即使不可达也要导出填充后的参数）
    const targetedMonsterIdxs = new Set<number>();
    for (const t of targets) {
      targetedMonsterIdxs.add(t.monsterIdx);
    }

    // 创建深拷贝并预填充 timeWeight
    const workingMonsters: Monster[] = this.monsters.map(m => ({
      ...m,
      timeWeight: [...m.timeWeight],
      numWeight: [...m.numWeight],
    }));

    const workingMapConfig: MapConfig = {
      ...this.mapConfig,
      genProb: [...this.mapConfig.genProb],
    };

    const numWaves = workingMapConfig.numWaves;
    for (const m of workingMonsters) {
      while (m.timeWeight.length < numWaves) {
        m.timeWeight.push(m.timeWeight.length > 0 ? m.timeWeight[m.timeWeight.length - 1] : 1.0);
      }
    }

    // 过滤不可达目标
    const unreachable = getUnreachableWaves(targets, this.mapConfig, this.monsters);
    console.log('[优化器] 目标数:', targets.length, '不可达:', unreachable.length);
    if (unreachable.length > 0) {
      console.log('  不可达详情:', unreachable.map(u => `monster=${u.monsterIdx} wave=${u.wave} reason=${u.reason}`));
    }
    const reachableTargets = targets.map(t => ({
      ...t,
      targets: t.targets.filter(({ wave }) =>
        !unreachable.some(u => u.monsterIdx === t.monsterIdx && u.pool === t.pool && u.wave === wave)
      ),
    })).filter(t => t.targets.length > 0);

    // 如果所有目标都不可达，仍返回填充后的参数（确保导出有效）
    if (reachableTargets.length === 0) {
      const timeWeightChangesFull: { monsterIdx: number; newValues: number[] }[] = [];
      for (const idx of targetedMonsterIdxs) {
        timeWeightChangesFull.push({ monsterIdx: idx, newValues: [...workingMonsters[idx].timeWeight] });
      }
      const verifiedResult = await this.workerPool.optimizationRun(this.mapConfig.mapId, OPT_TRIALS, 42);
      return {
        timeWeightChanges: timeWeightChangesFull,
        genProbChanges: [],
        verifiedCurve: verifiedResult.indoorExpected,
        rmse: 0,
        unreachableCount: targets.reduce((s, t) => s + t.targets.length, 0),
        unreachableReason: '所有目标不可达(genProb=0)',
      };
    }

    const timeWeightChanges: Map<number, number[]> = new Map();
    const allTargetPoints = reachableTargets.flatMap(t => {
      return t.targets.map(({ wave, value }) => ({
        monsterIdx: t.monsterIdx, pool: t.pool, dataMode: t.dataMode, wave, targetValue: value
      }));
    });
    console.log('[优化器] 可达目标点数:', allTargetPoints.length, 'numWaves:', numWaves);

    // 固定的基础种子，确保每轮对比公平
    const BASE_SEED = 99999;
    const unreachablePoints: Set<string> = new Set(); // 收集各轮发现的不可达点

    // 坐标下降主循环
    for (let round = 0; round < 10; round++) {
      if (onProgress) onProgress(Math.round((round / 10) * 80));

      // 评估当前误差（复用已有 Worker，不重建）
      await this.workerPool.reinit([workingMapConfig], workingMonsters);
      const currentResult = await this.workerPool.optimizationRun(workingMapConfig.mapId, OPT_TRIALS, BASE_SEED + round * 1000);

      // 按误差从大到小排序
      const sortedPoints = allTargetPoints
        .map(tp => {
          const data = getOptData(currentResult, tp.pool, tp.dataMode);
          const currentValue = toDisplayValue(data[tp.wave]?.[tp.monsterIdx] ?? 0, tp.dataMode);
          return { ...tp, currentValue, error: Math.abs(currentValue - tp.targetValue) };
        })
        .sort((a, b) => b.error - a.error);

      console.log(`[优化器] 第 ${round} 轮: 最大误差=${sortedPoints[0]?.error?.toFixed(2) ?? 'N/A'}, 目标值=${sortedPoints[0]?.targetValue}, 当前值=${sortedPoints[0]?.currentValue?.toFixed(2) ?? 'N/A'}`);

      let anyImproved = false;

      for (const { monsterIdx, wave, targetValue, pool, dataMode, error } of sortedPoints) {
        // 跳过已标记不可达的点
        const pointKey = `${monsterIdx}-${wave}`;
        if (unreachablePoints.has(pointKey)) continue;

        // 只优化误差 > 阈值 的目标点（prob 模式用 0.5，count 模式用 0.1）
        const minError = dataMode === 'prob' ? 0.5 : 0.1;
        if (error < minError) continue;

        const oldTw = workingMonsters[monsterIdx].timeWeight[wave];
        const optResult = await optimizeTimeWeight(
          monsterIdx, wave, targetValue, pool, dataMode,
          workingMonsters, workingMapConfig,
          this.workerPool,
          BASE_SEED + round * 1000
        );

        if (!optResult.reachable) {
          unreachablePoints.add(pointKey);
          console.log(`[优化器]   跳过不可达: monster=${monsterIdx} wave=${wave} maxReachable=${optResult.maxReachable.toFixed(2)} target=${targetValue.toFixed(1)}`);
          continue;
        }

        const newTw = workingMonsters[monsterIdx].timeWeight[wave];
        // 只有实际改变了值才记录
        if (Math.abs(newTw - oldTw) > 0.001) {
          timeWeightChanges.set(monsterIdx, [...workingMonsters[monsterIdx].timeWeight]);
          anyImproved = true;
          console.log(`[优化器]   monster=${monsterIdx} wave=${wave} oldTw=${oldTw.toFixed(3)} → newTw=${newTw.toFixed(3)} target=${targetValue.toFixed(1)}`);
        }
      }

      // 收敛检查
      await this.workerPool.reinit([workingMapConfig], workingMonsters);
      const roundResult = await this.workerPool.optimizationRun(workingMapConfig.mapId, OPT_TRIALS, BASE_SEED + round * 1000);

      let allConverged = true;
      for (const tp of allTargetPoints) {
        const data = getOptData(roundResult, tp.pool, tp.dataMode);
        const val = toDisplayValue(data[tp.wave]?.[tp.monsterIdx] ?? 0, tp.dataMode);
        const convThreshold = tp.dataMode === 'prob' ? 1.0 : 0.2;
        if (Math.abs(val - tp.targetValue) > convThreshold) {
          allConverged = false;
          break;
        }
      }

      if (allConverged || !anyImproved) break;
    }

    if (onProgress) onProgress(90);

    // 最终验证：更多次数
    await this.workerPool.reinit([workingMapConfig], workingMonsters);
    const finalResult = await this.workerPool.simulate(workingMapConfig.mapId, 10000, 42);
    const finalRMSE = calcRMSE(targets, finalResult);

    if (onProgress) onProgress(100);

    // 确保所有有目标的怪物都出现在结果中（即使 timeWeight 没变也要输出填充后的数组）
    for (const idx of targetedMonsterIdxs) {
      if (!timeWeightChanges.has(idx)) {
        timeWeightChanges.set(idx, [...workingMonsters[idx].timeWeight]);
      }
    }

    console.log('[优化器] 完成, timeWeight变更:', timeWeightChanges.size, '不可达:', unreachablePoints.size, 'RMSE:', finalRMSE.toFixed(4));
    for (const [idx, tw] of timeWeightChanges) {
      console.log(`  monster=${idx} timeWeight=[${tw.map(v => v.toFixed(3)).join(', ')}]`);
    }
    if (unreachablePoints.size > 0) {
      console.log(`  不可达点位: ${[...unreachablePoints].join(', ')} (受maxNum/genProb限制，需调整前序波次或提高上限)`);
    }

    const totalUnreachable = unreachable.length + unreachablePoints.size;
    const unreachableReason = totalUnreachable > 0
      ? `${totalUnreachable} 个目标不可达（maxNum上限/genProb=0 限制），需调整前序波次或提高上限`
      : '';

    const timeWeightChangesArr = Array.from(timeWeightChanges.entries()).map(([monsterIdx, newValues]) => ({
      monsterIdx,
      newValues,
    }));

    return {
      timeWeightChanges: timeWeightChangesArr,
      genProbChanges: [],
      verifiedCurve: finalResult.indoorExpected,
      rmse: finalRMSE,
      unreachableCount: totalUnreachable,
      unreachableReason,
    };
  }
}
