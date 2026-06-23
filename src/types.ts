/** 怪物数据 */
export interface Monster {
  /** 在 monster_class 列表中的索引 (0-7) */
  idx: number;
  /** MonsterEnum ID，如 "蕉叶女妖" */
  id: string;
  /** 显示名称 */
  name: string;
  /** 怪物权重（占用权值上限的量） */
  monsterWeight: number;
  /** 时间修正数组 [波次] -> 权重，越界用最后一个值 */
  timeWeight: number[];
  /** 数量修正数组 [场上数量] -> 权重，越界用最后一个值 */
  numWeight: number[];
  /** 最大同时在场数 */
  maxNum: number;
  /** 最大总生成数，-1 表示无限 */
  maxNumGenerated: number;
  /** 出生点类型：1=室内, 2=室外, 3=两者 */
  bornPosType: 1 | 2 | 3;
}

/** 地图配置 */
export interface MapConfig {
  /** 地图 ID，如 "Castle_001" */
  mapId: string;
  /** 区域 ID，如 "Castle" */
  regionId: string;
  /** 难度，如 "C"/"B"/"A"/"S" */
  difficulty: string;
  /** 8个怪物的基础生成概率（与 monster_class 顺序对应） */
  genProb: number[];
  /** 室外权值上限 */
  outdoorTotalWeight: number;
  /** 室内权值上限 */
  indoorTotalWeight: number;
  /** 刷怪周期（秒） */
  spawnCycle: number;
  /** 游戏时长（秒） */
  gameDuration: number;
  /** 总波次数 = Math.floor(gameDuration/spawnCycle) + 1 */
  numWaves: number;
}

/** Monte Carlo 模拟结果 */
export interface SimulationResult {
  /** 地图 ID */
  mapId: string;
  /** 模拟次数 */
  numTrials: number;
  /** 总波次数 */
  numWaves: number;
  /** 室外期望累计数量 [wave][monsterIdx] */
  outdoorExpected: number[][];
  /** 室内期望累计数量 [wave][monsterIdx] */
  indoorExpected: number[][];
  /** 室外每波总期望数量 [wave] */
  outdoorTotal: number[];
  /** 室内每波总期望数量 [wave] */
  indoorTotal: number[];
  /** 室外每波生成概率 [wave][monsterIdx] — 该波选中该怪物的概率 (0~1) */
  outdoorSpawnProb: number[][];
  /** 室内每波生成概率 [wave][monsterIdx] */
  indoorSpawnProb: number[][];
}

/** 优化目标：用户拖拽设定的目标值 */
export interface OptimizationTarget {
  /** 怪物索引 */
  monsterIdx: number;
  /** 池子类型 */
  pool: 'indoor' | 'outdoor';
  /** 目标点列表 */
  targets: { wave: number; value: number }[];
}

/** 优化结果：反推得到的参数建议 */
export interface OptimizationResult {
  /** time_weight 修改建议 */
  timeWeightChanges: { monsterIdx: number; newValues: number[] }[];
  /** gen_prob 修改建议 */
  genProbChanges: { monsterIdx: number; newValue: number }[];
  /** 用优化后参数验证的曲线 [wave][monsterIdx] */
  verifiedCurve: number[][];
  /** 优化后的 RMSE */
  rmse: number;
}

/** 池子状态（模拟内部使用） */
export interface PoolState {
  /** 权值上限 */
  totalWeightLimit: number;
  /** 当前累积权值 */
  currentTotalWeight: number;
  /** 各怪物当前场上数量 [monsterIdx] -> count */
  monsterCounts: number[];
  /** 各怪物总生成数 [monsterIdx] -> count */
  monsterGenerated: number[];
}
