import { describe, it, expect } from 'vitest';
import { mulberry32, createSeededRng } from './prng';

describe('mulberry32 PRNG', () => {
  it('相同种子产生相同序列', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('不同种子产生不同序列', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(123);
    const vals1 = Array.from({ length: 10 }, () => rng1());
    const vals2 = Array.from({ length: 10 }, () => rng2());
    expect(vals1).not.toEqual(vals2);
  });

  it('输出范围在 [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('均匀性：100万次调用均值接近 0.5', () => {
    const rng = mulberry32(42);
    let sum = 0;
    const N = 1_000_000;
    for (let i = 0; i < N; i++) {
      sum += rng();
    }
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.499);
    expect(mean).toBeLessThan(0.501);
  });
});

describe('createSeededRng', () => {
  it('random() 返回 [0,1)', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randInt(max) 返回 [0, max) 整数', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.randInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
