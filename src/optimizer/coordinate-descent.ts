import type { MapConfig, Monster, OptimizationTarget, OptimizationResult, SimulationResult } from '../types';
import { WorkerPool } from '../workers/worker-pool';

/** 计算 RMSE */
function calcRMSE(targets: OptimizationTarget[], result: SimulationResult): number {
  let sumSq = 0;
  let count = 0;

  for (const target of targets) {
    const data = target.pool === 'indoor' ? result.indoorExpected : result.outdoorExpected;
    for (const { wave, value } of target.targets) {
      if (wave < data.length) {
        const diff = data[wave][target.monsterIdx] - value;
        sumSq += diff * diff;
        count++;
      }
    }
  }

  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

/** 检测不可达目标 */
export function getUnreachableWaves(
  targets: OptimizationTarget[],
  mapConfig: MapConfig,
  monsters: Monster[]
): { monsterIdx: number; pool: string; wave: number; reason: string }[] {
  const unreachable: { monsterIdx: number; pool: string; wave: number; reason: string }[] = [];

  for (const target of targets) {
    const monster = monsters[target.monsterIdx];
    const genProb = mapConfig.genProb[target.monsterIdx];

    for (const { wave, value } of target.targets) {
      if (genProb <= 0) {
        unreachable.push({ monsterIdx: target.monsterIdx, pool: target.pool, wave, reason: 'gen_prob=0' });
      } else if (value > monster.maxNum) {
        unreachable.push({ monsterIdx: target.monsterIdx, pool: target.pool, wave, reason: `超过 maxNum(${monster.maxNum})` });
      }
    }
  }

  return unreachable;
}

/** 对单个目标的 timeWeight 进行二分搜索优化 */
async function optimizeTimeWeight(
  monsterIdx: number,
  wave: number,
  targetValue: number,
  pool: 'indoor' | 'outdoor',
  workingMonsters: Monster[],
  workingMapConfig: MapConfig,
  workerPool: WorkerPool,
  baseSeed: number
): Promise<number> {
  const monster = workingMonsters[monsterIdx];

  // 确保 timeWeight 数组足够长
  while (monster.timeWeight.length <= wave) {
    monster.timeWeight.push(monster.timeWeight.length > 0 ? monster.timeWeight[monster.timeWeight.length - 1] : 1.0);
  }

  const oldVal = monster.timeWeight[wave];
  let bestVal = oldVal;
  let bestError = Infinity;

  // 粗搜：测试多个采样点找到最优方向
  const samples = [0, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0];
  for (const sample of samples) {
    monster.timeWeight[wave] = sample;
    await workerPool.init([workingMapConfig], workingMonsters);
    const testResult = await workerPool.optimizationRun(workingMapConfig.mapId, 3000, baseSeed + Math.round(sample * 100));

    const testData = pool === 'indoor' ? testResult.indoorExpected : testResult.outdoorExpected;
    const testValue = testData[wave]?.[monsterIdx] ?? 0;
    const testError = Math.abs(testValue - targetValue);

    if (testError < bestError) {
      bestError = testError;
      bestVal = sample;
    }
  }

  // 精搜：在最优样本附近二分搜索
  let lo = Math.max(0, bestVal - 1.0);
  let hi = Math.min(5.0, bestVal + 1.0);

  for (let iter = 0; iter < 8; iter++) {
    const mid = (lo + hi) / 2;
    monster.timeWeight[wave] = mid;
    await workerPool.init([workingMapConfig], workingMonsters);
    const testResult = await workerPool.optimizationRun(workingMapConfig.mapId, 3000, baseSeed + 1000 + iter);

    const testData = pool === 'indoor' ? testResult.indoorExpected : testResult.outdoorExpected;
    const testValue = testData[wave]?.[monsterIdx] ?? 0;
    const testError = Math.abs(testValue - targetValue);

    if (testError < bestError) {
      bestError = testError;
      bestVal = mid;
    }

    if (testValue < targetValue) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // 应用最优值
  monster.timeWeight[wave] = bestVal;
  return bestVal;
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
    // 过滤不可达目标
    const unreachable = getUnreachableWaves(targets, this.mapConfig, this.monsters);
    const reachableTargets = targets.map(t => ({
      ...t,
      targets: t.targets.filter(({ wave }) =>
        !unreachable.some(u => u.monsterIdx === t.monsterIdx && u.pool === t.pool && u.wave === wave)
      ),
    })).filter(t => t.targets.length > 0);

    if (reachableTargets.length === 0) {
      const verifiedResult = await this.workerPool.optimizationRun(this.mapConfig.mapId, 2000, 42);
      return {
        timeWeightChanges: [],
        genProbChanges: [],
        verifiedCurve: verifiedResult.indoorExpected,
        rmse: 0,
      };
    }

    // 深拷贝
    const workingMonsters: Monster[] = this.monsters.map(m => ({
      ...m,
      timeWeight: [...m.timeWeight],
      numWeight: [...m.numWeight],
    }));

    const workingMapConfig: MapConfig = {
      ...this.mapConfig,
      genProb: [...this.mapConfig.genProb],
    };

    const timeWeightChanges: Map<number, number[]> = new Map();
    const allTargetPoints = reachableTargets.flatMap(t =>
      t.targets.map(({ wave, value }) => ({ monsterIdx: t.monsterIdx, pool: t.pool, wave, targetValue: value }))
    );
    const totalPoints = allTargetPoints.length;

    // 坐标下降主循环
    for (let round = 0; round < 10; round++) {
      if (onProgress) onProgress(Math.round((round / 10) * 80));

      // 评估当前误差
      await this.workerPool.init([workingMapConfig], workingMonsters);
      const currentResult = await this.workerPool.optimizationRun(workingMapConfig.mapId, 3000, 42 + round * 100);

      // 按误差从大到小排序
      const sortedPoints = allTargetPoints
        .map(tp => {
          const data = tp.pool === 'indoor' ? currentResult.indoorExpected : currentResult.outdoorExpected;
          const currentValue = data[tp.wave]?.[tp.monsterIdx] ?? 0;
          return { ...tp, currentValue, error: Math.abs(currentValue - tp.targetValue) };
        })
        .sort((a, b) => b.error - a.error);

      let anyImproved = false;

      for (const { monsterIdx, wave, targetValue, pool, error } of sortedPoints) {
        if (error < 0.05) continue;

        const newVal = await optimizeTimeWeight(
          monsterIdx, wave, targetValue, pool,
          workingMonsters, workingMapConfig,
          this.workerPool,
          1000 + round * 1000
        );

        timeWeightChanges.set(monsterIdx, [...workingMonsters[monsterIdx].timeWeight]);
        anyImproved = true;
      }

      // 收敛检查
      await this.workerPool.init([workingMapConfig], workingMonsters);
      const roundResult = await this.workerPool.optimizationRun(workingMapConfig.mapId, 5000, 42 + round * 100);

      // 检查是否所有目标都已接近
      let allConverged = true;
      for (const tp of allTargetPoints) {
        const data = tp.pool === 'indoor' ? roundResult.indoorExpected : roundResult.outdoorExpected;
        const val = data[tp.wave]?.[tp.monsterIdx] ?? 0;
        if (Math.abs(val - tp.targetValue) > 0.1) {
          allConverged = false;
          break;
        }
      }

      if (allConverged || !anyImproved) break;
    }

    if (onProgress) onProgress(90);

    // 最终验证：10000 次
    await this.workerPool.init([workingMapConfig], workingMonsters);
    const finalResult = await this.workerPool.simulate(workingMapConfig.mapId, 10000, 42);
    const finalRMSE = calcRMSE(reachableTargets, finalResult);

    if (onProgress) onProgress(100);

    const timeWeightChangesArr = Array.from(timeWeightChanges.entries()).map(([monsterIdx, newValues]) => ({
      monsterIdx,
      newValues,
    }));

    return {
      timeWeightChanges: timeWeightChangesArr,
      genProbChanges: [],
      verifiedCurve: finalResult.indoorExpected,
      rmse: finalRMSE,
    };
  }
}
