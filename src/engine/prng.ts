/**
 * mulberry32 可种子化伪随机数生成器
 * 返回 [0, 1) 范围的浮点数
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 带辅助方法的随机数生成器接口 */
export interface SeededRng {
  /** 返回 [0, 1) 的随机浮点数 */
  random(): number;
  /** 返回 [0, max) 的随机整数 */
  randInt(max: number): number;
}

/**
 * 创建带种子的随机数生成器
 * @param seed 随机种子，相同种子产生相同序列
 */
export function createSeededRng(seed: number): SeededRng {
  const rng = mulberry32(seed);
  return {
    random(): number {
      return rng();
    },
    randInt(max: number): number {
      return Math.floor(rng() * max);
    }
  };
}
