import type { Monster, MapConfig, SimulationResult, PoolState } from '../types';
import { createSeededRng } from './prng';

/** 获取怪物在指定波次的时间修正权重，越界用最后一个值 */
export function getTimeWeight(monster: Monster, wave: number): number {
  if (!monster.timeWeight || monster.timeWeight.length === 0) return 0;
  const idx = Math.min(wave, monster.timeWeight.length - 1);
  return monster.timeWeight[idx];
}

/** 获取怪物在指定场上数量时的数量修正权重，越界用最后一个值 */
export function getNumWeight(monster: Monster, currentCount: number): number {
  if (!monster.numWeight || monster.numWeight.length === 0) return 0;
  const idx = Math.min(currentCount, monster.numWeight.length - 1);
  return monster.numWeight[idx];
}

/** 检查怪物是否满足生成条件 */
export function checkSpawnConditions(
  monster: Monster,
  poolState: PoolState,
  wave: number,
  genProb: number
): boolean {
  const idx = monster.idx;
  const currentCount = poolState.monsterCounts[idx] ?? 0;
  const totalGenerated = poolState.monsterGenerated[idx] ?? 0;

  // 基础概率为0
  if (genProb <= 0) return false;

  // 达到最大同时在场数
  if (currentCount >= monster.maxNum) return false;

  // 达到最大总生成数（-1 表示无限）
  if (monster.maxNumGenerated >= 0 && totalGenerated >= monster.maxNumGenerated) return false;

  // 时间修正为0
  if (getTimeWeight(monster, wave) <= 0) return false;

  // 数量修正为0
  if (getNumWeight(monster, currentCount) <= 0) return false;

  // 检查生成后权值是否会超出上限
  if (poolState.currentTotalWeight + monster.monsterWeight > poolState.totalWeightLimit) return false;

  return true;
}

/** 计算本波次各怪物的生成概率（未归一化），返回 [monsterIdx, rawProb][] */
export function computeSpawnProbs(
  mapCfg: MapConfig,
  monsters: Monster[],
  poolState: PoolState,
  poolType: 'indoor' | 'outdoor',
  wave: number
): [number, number][] {
  const rawProbs: [number, number][] = [];

  for (const monster of monsters) {
    // 过滤不属于该池子的怪物
    if (poolType === 'indoor' && monster.bornPosType !== 1 && monster.bornPosType !== 3) continue;
    if (poolType === 'outdoor' && monster.bornPosType !== 2 && monster.bornPosType !== 3) continue;

    const genProb = mapCfg.genProb[monster.idx];
    if (!checkSpawnConditions(monster, poolState, wave, genProb)) continue;

    const currentCount = poolState.monsterCounts[monster.idx] ?? 0;
    const tw = getTimeWeight(monster, wave);
    const nw = getNumWeight(monster, currentCount);
    const rawProb = genProb * tw * nw;

    if (rawProb > 0) {
      rawProbs.push([monster.idx, rawProb]);
    }
  }

  return rawProbs;
}

/** 创建初始池子状态 */
function createPoolState(totalWeightLimit: number, numMonsters: number): PoolState {
  return {
    totalWeightLimit,
    currentTotalWeight: 0,
    monsterCounts: new Array(numMonsters).fill(0),
    monsterGenerated: new Array(numMonsters).fill(0),
  };
}

/** 按权重随机选择一个怪物索引 */
function weightedChoice(probs: [number, number][], randomVal: number): number | null {
  if (probs.length === 0) return null;
  const total = probs.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return null;

  let cumulative = 0;
  for (const [idx, p] of probs) {
    cumulative += p / total;
    if (randomVal <= cumulative) return idx;
  }
  // 浮点精度兜底
  return probs[probs.length - 1][0];
}

/** 模拟一局游戏，返回每波次每种怪物的场上数量 */
export function simulateOneGame(
  mapCfg: MapConfig,
  monsters: Monster[],
  rng: { random(): number }
): { indoor: number[][]; outdoor: number[][] } {
  const numMonsters = monsters.length;
  const numWaves = mapCfg.numWaves;

  const outdoorState = createPoolState(mapCfg.outdoorTotalWeight, numMonsters);
  const indoorState = createPoolState(mapCfg.indoorTotalWeight, numMonsters);

  const outdoorResult: number[][] = [];
  const indoorResult: number[][] = [];

  for (let wave = 0; wave < numWaves; wave++) {
    // --- 室外生成 ---
    const outdoorProbs = computeSpawnProbs(mapCfg, monsters, outdoorState, 'outdoor', wave);
    if (outdoorProbs.length > 0) {
      const chosen = weightedChoice(outdoorProbs, rng.random());
      if (chosen !== null) {
        outdoorState.monsterCounts[chosen]++;
        outdoorState.monsterGenerated[chosen]++;
        outdoorState.currentTotalWeight += monsters[chosen].monsterWeight;
      }
    }

    // --- 室内生成 ---
    const indoorProbs = computeSpawnProbs(mapCfg, monsters, indoorState, 'indoor', wave);
    if (indoorProbs.length > 0) {
      const chosen = weightedChoice(indoorProbs, rng.random());
      if (chosen !== null) {
        indoorState.monsterCounts[chosen]++;
        indoorState.monsterGenerated[chosen]++;
        indoorState.currentTotalWeight += monsters[chosen].monsterWeight;
      }
    }

    // 记录本波结束时的场上数量
    outdoorResult.push([...outdoorState.monsterCounts]);
    indoorResult.push([...indoorState.monsterCounts]);
  }

  return { indoor: indoorResult, outdoor: outdoorResult };
}

/**
 * 运行 Monte Carlo 模拟
 * @param mapCfg 地图配置
 * @param monsters 怪物列表
 * @param numTrials 模拟次数
 * @param seed 随机种子
 */
export function monteCarloSimulate(
  mapCfg: MapConfig,
  monsters: Monster[],
  numTrials: number = 10000,
  seed: number = 42
): SimulationResult {
  const rng = createSeededRng(seed);
  const numMonsters = monsters.length;
  const numWaves = mapCfg.numWaves;

  // 累加器
  const outdoorAccum: number[][] = Array.from({ length: numWaves }, () => new Array(numMonsters).fill(0));
  const indoorAccum: number[][] = Array.from({ length: numWaves }, () => new Array(numMonsters).fill(0));

  for (let trial = 0; trial < numTrials; trial++) {
    const result = simulateOneGame(mapCfg, monsters, rng);
    for (let wave = 0; wave < numWaves; wave++) {
      for (let idx = 0; idx < numMonsters; idx++) {
        outdoorAccum[wave][idx] += result.outdoor[wave][idx];
        indoorAccum[wave][idx] += result.indoor[wave][idx];
      }
    }
  }

  // 计算期望
  const outdoorExpected: number[][] = [];
  const indoorExpected: number[][] = [];
  const outdoorTotal: number[] = [];
  const indoorTotal: number[] = [];

  for (let wave = 0; wave < numWaves; wave++) {
    const outdoorRow: number[] = [];
    const indoorRow: number[] = [];
    let outTotal = 0;
    let inTotal = 0;

    for (let idx = 0; idx < numMonsters; idx++) {
      const outExp = outdoorAccum[wave][idx] / numTrials;
      const inExp = indoorAccum[wave][idx] / numTrials;
      outdoorRow.push(Math.round(outExp * 10000) / 10000);
      indoorRow.push(Math.round(inExp * 10000) / 10000);
      outTotal += outExp;
      inTotal += inExp;
    }

    outdoorExpected.push(outdoorRow);
    indoorExpected.push(indoorRow);
    outdoorTotal.push(Math.round(outTotal * 10000) / 10000);
    indoorTotal.push(Math.round(inTotal * 10000) / 10000);
  }

  return {
    mapId: mapCfg.mapId,
    numTrials,
    numWaves,
    outdoorExpected,
    indoorExpected,
    outdoorTotal,
    indoorTotal,
  };
}
