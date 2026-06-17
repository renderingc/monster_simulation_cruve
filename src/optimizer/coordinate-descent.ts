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

/** 检测不可达目标（genProb=0 或 maxNumGenerated 限制） */
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

export class Optimizer {
  private workerPool: WorkerPool;
  private mapConfig: MapConfig;
  private monsters: Monster[];

  constructor(workerPool: WorkerPool, mapConfig: MapConfig, monsters: Monster[]) {
    this.workerPool = workerPool;
    this.mapConfig = mapConfig;
    this.monsters = monsters;
  }

  /**
   * 坐标下降优化
   * @param targets 用户设定的目标点
   * @param onProgress 进度回调 (0-100)
   */
  async optimize(
    targets: OptimizationTarget[],
    onProgress?: (p: number) => void
  ): Promise<OptimizationResult> {
    // 过滤不可达目标
    const unreachable = getUnreachableWaves(targets, this.mapConfig, this.monsters);
    const reachableTargets = targets.map(t => ({
      ...t,
      targets: t.targets.filter(({ wave, value }) => {
        return !unreachable.some(u =>
          u.monsterIdx === t.monsterIdx && u.pool === t.pool && u.wave === wave
        );
      }),
    })).filter(t => t.targets.length > 0);

    if (reachableTargets.length === 0) {
      // 所有目标不可达，返回空结果
      const verifiedResult = await this.workerPool.optimizationRun(this.mapConfig.mapId, 2000, 42);
      return {
        timeWeightChanges: [],
        genProbChanges: [],
        verifiedCurve: verifiedResult.indoorExpected,
        rmse: 0,
      };
    }

    // 深拷贝怪物配置（避免修改原始数据）
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
    const genProbChanges: Map<number, number> = new Map();

    let bestRMSE = Infinity;
    let noImprovementCount = 0;
    const maxRounds = 30;
    const totalSteps = maxRounds * reachableTargets.reduce((s, t) => s + t.targets.length, 0);
    let stepsDone = 0;

    // 坐标下降主循环
    for (let round = 0; round < maxRounds; round++) {
      let roundImproved = false;

      // 对每个目标按误差从大到小排序
      const currentResult = await this.workerPool.optimizationRun(
        workingMapConfig.mapId, 2000, 42 + round
      );

      // 按误差排序目标
      const sortedTargets = reachableTargets.flatMap(t =>
        t.targets.map(({ wave, value }) => ({
          monsterIdx: t.monsterIdx,
          pool: t.pool,
          wave,
          targetValue: value,
          currentValue: (t.pool === 'indoor' ? currentResult.indoorExpected : currentResult.outdoorExpected)[wave]?.[t.monsterIdx] ?? 0,
          error: Math.abs(((t.pool === 'indoor' ? currentResult.indoorExpected : currentResult.outdoorExpected)[wave]?.[t.monsterIdx] ?? 0) - value),
        }))
      ).sort((a, b) => b.error - a.error);

      for (const { monsterIdx, wave, targetValue, error } of sortedTargets) {
        if (error < 0.1) {
          stepsDone++;
          continue;
        }

        const monster = workingMonsters[monsterIdx];

        // 二分搜索 timeWeight[wave]
        let lo = 0;
        let hi = 5.0;
        let bestVal = monster.timeWeight[Math.min(wave, monster.timeWeight.length - 1)];

        for (let iter = 0; iter < 7; iter++) {
          const mid = (lo + hi) / 2;

          // 临时修改 timeWeight
          const origTimeWeight = [...monster.timeWeight];
          const twIdx = Math.min(wave, monster.timeWeight.length - 1);
          monster.timeWeight[twIdx] = mid;

          // 重新初始化 Worker 并运行
          await this.workerPool.init([workingMapConfig], workingMonsters);
          const testResult = await this.workerPool.optimizationRun(workingMapConfig.mapId, 2000, 42);

          const testValue = (wave < testResult.indoorExpected.length)
            ? (monsterIdx < testResult.indoorExpected[wave].length ? testResult.indoorExpected[wave][monsterIdx] : 0)
            : 0;

          if (testValue < targetValue) {
            lo = mid;
            bestVal = mid;
          } else {
            hi = mid;
          }

          monster.timeWeight = origTimeWeight;
        }

        // 应用最优值
        const twIdx = Math.min(wave, monster.timeWeight.length - 1);
        monster.timeWeight[twIdx] = bestVal;
        timeWeightChanges.set(monsterIdx, [...monster.timeWeight]);
        roundImproved = true;

        stepsDone++;
        if (onProgress) {
          onProgress(Math.min(90, Math.round((stepsDone / totalSteps) * 90)));
        }
      }

      // 重新初始化 Worker 使用更新后的配置
      await this.workerPool.init([workingMapConfig], workingMonsters);

      const roundResult = await this.workerPool.optimizationRun(workingMapConfig.mapId, 2000, 42);
      const roundRMSE = calcRMSE(reachableTargets, roundResult);

      if (roundRMSE < bestRMSE - 0.01) {
        bestRMSE = roundRMSE;
        noImprovementCount = 0;
        roundImproved = true;
      } else {
        noImprovementCount++;
      }

      // 收敛条件
      if (bestRMSE < 0.1 || noImprovementCount >= 3) break;
    }

    if (onProgress) onProgress(95);

    // 最终用 10000 次 MC 验证结果
    await this.workerPool.init([workingMapConfig], workingMonsters);
    const finalResult = await this.workerPool.simulate(workingMapConfig.mapId, 10000, 42);
    const finalRMSE = calcRMSE(reachableTargets, finalResult);

    if (onProgress) onProgress(100);

    // 构建返回结果
    const timeWeightChangesArr = Array.from(timeWeightChanges.entries()).map(([monsterIdx, newValues]) => ({
      monsterIdx,
      newValues,
    }));

    const genProbChangesArr = Array.from(genProbChanges.entries()).map(([monsterIdx, newValue]) => ({
      monsterIdx,
      newValue,
    }));

    return {
      timeWeightChanges: timeWeightChangesArr,
      genProbChanges: genProbChangesArr,
      verifiedCurve: finalResult.indoorExpected,
      rmse: finalRMSE,
    };
  }
}
