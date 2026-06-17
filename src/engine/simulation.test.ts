import { describe, it, expect } from 'vitest';
import type { Monster, MapConfig } from '../types';
import { getTimeWeight, getNumWeight, checkSpawnConditions, monteCarloSimulate } from './simulation';

/** 创建测试用怪物 */
function createMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    idx: 0,
    id: 'TestMonster',
    name: '测试怪物',
    monsterWeight: 3,
    timeWeight: [1, 1, 1, 1, 1],
    numWeight: [1, 0.5],
    maxNum: 2,
    maxNumGenerated: -1,
    bornPosType: 1,
    ...overrides,
  };
}

/** 创建测试用地图配置 */
function createMapConfig(overrides: Partial<MapConfig> = {}): MapConfig {
  return {
    mapId: 'Test_001',
    regionId: 'Test',
    difficulty: 'C',
    genProb: [2.5, 3, 2, 2, 1, 2, 0, 1],
    outdoorTotalWeight: 10,
    indoorTotalWeight: 15,
    spawnCycle: 60,
    gameDuration: 900,
    numWaves: 16,
    ...overrides,
  };
}

describe('getTimeWeight', () => {
  it('应返回对应波次的时间权重', () => {
    const m = createMonster({ timeWeight: [0, 0.5, 1, 1] });
    expect(getTimeWeight(m, 0)).toBe(0);
    expect(getTimeWeight(m, 1)).toBe(0.5);
    expect(getTimeWeight(m, 2)).toBe(1);
  });

  it('越界时应返回最后一个值', () => {
    const m = createMonster({ timeWeight: [0, 0.5, 1] });
    expect(getTimeWeight(m, 10)).toBe(1);
    expect(getTimeWeight(m, 100)).toBe(1);
  });

  it('空数组时应返回 0', () => {
    const m = createMonster({ timeWeight: [] });
    expect(getTimeWeight(m, 0)).toBe(0);
  });
});

describe('getNumWeight', () => {
  it('应返回对应数量的权重', () => {
    const m = createMonster({ numWeight: [1, 0.5, 0.2] });
    expect(getNumWeight(m, 0)).toBe(1);
    expect(getNumWeight(m, 1)).toBe(0.5);
    expect(getNumWeight(m, 2)).toBe(0.2);
  });

  it('越界时应返回最后一个值', () => {
    const m = createMonster({ numWeight: [1, 0.5] });
    expect(getNumWeight(m, 5)).toBe(0.5);
  });
});

describe('checkSpawnConditions', () => {
  it('genProb=0 时应返回 false', () => {
    const m = createMonster();
    const pool = { totalWeightLimit: 10, currentTotalWeight: 0, monsterCounts: [0], monsterGenerated: [0] };
    expect(checkSpawnConditions(m, pool, 0, 0)).toBe(false);
  });

  it('达到 maxNum 时应返回 false', () => {
    const m = createMonster({ maxNum: 2 });
    const pool = { totalWeightLimit: 10, currentTotalWeight: 6, monsterCounts: [2], monsterGenerated: [2] };
    expect(checkSpawnConditions(m, pool, 0, 2)).toBe(false);
  });

  it('达到 maxNumGenerated 时应返回 false', () => {
    const m = createMonster({ maxNumGenerated: 3 });
    const pool = { totalWeightLimit: 10, currentTotalWeight: 0, monsterCounts: [0], monsterGenerated: [3] };
    expect(checkSpawnConditions(m, pool, 0, 2)).toBe(false);
  });

  it('maxNumGenerated=-1 时不限制总生成数', () => {
    const m = createMonster({ maxNumGenerated: -1, maxNum: 99 });
    const pool = { totalWeightLimit: 10, currentTotalWeight: 0, monsterCounts: [0], monsterGenerated: [1000] };
    expect(checkSpawnConditions(m, pool, 0, 2)).toBe(true);
  });

  it('权值超出上限时应返回 false', () => {
    const m = createMonster({ monsterWeight: 5 });
    const pool = { totalWeightLimit: 10, currentTotalWeight: 8, monsterCounts: [0], monsterGenerated: [0] };
    expect(checkSpawnConditions(m, pool, 0, 2)).toBe(false);
  });
});

describe('monteCarloSimulate - 统计收敛性', () => {
  it('Castle_C 配置下 10000 次 MC 室内总数应收敛到参考值', () => {
    // Castle_C 近似配置（基于 Python 参考值）
    const monsters: Monster[] = [
      { idx: 0, id: 'BansheeGirl', name: '蕉叶女妖', monsterWeight: 3, timeWeight: [0, 0, 0.5, 1, 1], numWeight: [1, 0.5], maxNum: 2, maxNumGenerated: -1, bornPosType: 1 },
      { idx: 1, id: 'Stitcher', name: '缝补匠', monsterWeight: 3, timeWeight: [0, 0, 0, 0.5, 1, 1], numWeight: [1], maxNum: 1, maxNumGenerated: -1, bornPosType: 1 },
      { idx: 2, id: 'Spider', name: '蜘蛛', monsterWeight: 3, timeWeight: [1, 1, 1, 1, 1], numWeight: [1, 0.8], maxNum: 2, maxNumGenerated: -1, bornPosType: 1 },
      { idx: 3, id: 'Doll', name: '木偶', monsterWeight: 3, timeWeight: [0, 0, 0, 0.5, 1, 1], numWeight: [1, 0.5], maxNum: 2, maxNumGenerated: -1, bornPosType: 1 },
      { idx: 4, id: 'WastelandHound', name: '废墟恶犬', monsterWeight: 3, timeWeight: [1, 1, 1, 1, 1], numWeight: [1, 0.8, 0.5], maxNum: 3, maxNumGenerated: -1, bornPosType: 2 },
      { idx: 5, id: 'SandRat', name: '沙鼠', monsterWeight: 2, timeWeight: [0, 0, 0.5, 1, 1], numWeight: [1, 0.5], maxNum: 2, maxNumGenerated: -1, bornPosType: 1 },
      { idx: 6, id: 'Ghoul', name: '食尸鬼', monsterWeight: 3, timeWeight: [1, 1, 1, 1, 1], numWeight: [1, 0.5], maxNum: 2, maxNumGenerated: -1, bornPosType: 1 },
      { idx: 7, id: 'LittleRascal', name: '流氓猫', monsterWeight: 2, timeWeight: [0, 0, 0, 0.5, 1, 1], numWeight: [1], maxNum: 1, maxNumGenerated: 3, bornPosType: 1 },
    ];

    const mapCfg: MapConfig = {
      mapId: 'Castle_C',
      regionId: 'Castle',
      difficulty: 'C',
      genProb: [2.5, 3, 2, 2, 1, 2, 0, 1],
      outdoorTotalWeight: 10,
      indoorTotalWeight: 15,
      spawnCycle: 60,
      gameDuration: 900,
      numWaves: 16,
    };

    const result = monteCarloSimulate(mapCfg, monsters, 10000, 42);

    // wave 0: 只有蜘蛛（timeWeight[0]=1），其他怪物 timeWeight[0]=0
    // 室内 wave 0 total 应接近 1.0
    expect(result.indoorTotal[0]).toBeCloseTo(1.0, 0);

    // wave 10 室内总数应接近 Python 参考值 7.44（允许 ±1.0 误差，因 PRNG 不同）
    expect(result.indoorTotal[10]).toBeGreaterThan(5.0);
    expect(result.indoorTotal[10]).toBeLessThan(9.0);

    // wave 10 室外（WastelandHound）应接近 2.0
    expect(result.outdoorTotal[10]).toBeGreaterThan(1.0);
    expect(result.outdoorTotal[10]).toBeLessThan(3.5);

    // Ghoul（idx=6）genProb=0，室内期望应为 0
    expect(result.indoorExpected[10][6]).toBe(0);
  });

  it('相同种子应产生相同结果', () => {
    const monsters: Monster[] = [
      { idx: 0, id: 'A', name: 'A', monsterWeight: 3, timeWeight: [1, 1], numWeight: [1], maxNum: 2, maxNumGenerated: -1, bornPosType: 1 },
      { idx: 1, id: 'B', name: 'B', monsterWeight: 3, timeWeight: [1, 1], numWeight: [1], maxNum: 2, maxNumGenerated: -1, bornPosType: 2 },
    ];
    const mapCfg: MapConfig = {
      mapId: 'Test', regionId: 'Test', difficulty: 'C',
      genProb: [2, 1], outdoorTotalWeight: 5, indoorTotalWeight: 5,
      spawnCycle: 60, gameDuration: 300, numWaves: 6,
    };

    const r1 = monteCarloSimulate(mapCfg, monsters, 1000, 42);
    const r2 = monteCarloSimulate(mapCfg, monsters, 1000, 42);

    expect(r1.indoorTotal).toEqual(r2.indoorTotal);
    expect(r1.outdoorTotal).toEqual(r2.outdoorTotal);
  });
});
