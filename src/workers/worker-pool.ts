import type { MapConfig, Monster, SimulationResult } from '../types';

// Vite inline worker 导入（构建时内联到 HTML）
import SimWorker from './simulation.worker.ts?worker&inline';

interface WorkerState {
  worker: Worker;
  busy: boolean;
  ready: boolean;
}

export class WorkerPool {
  private workers: WorkerState[] = [];
  private numWorkers: number;
  public onProgress?: (percent: number) => void;

  constructor(numWorkers: number = 4) {
    this.numWorkers = numWorkers;
  }

  /** 初始化所有 Worker，传入地图和怪物配置 */
  async init(maps: MapConfig[], monsters: Monster[]): Promise<void> {
    // 清理旧 Worker
    this.workers.forEach(w => w.worker.terminate());
    this.workers = [];

    const initPromises = Array.from({ length: this.numWorkers }, () => {
      return new Promise<WorkerState>((resolve) => {
        const worker = new SimWorker();
        const state: WorkerState = { worker, busy: false, ready: false };

        worker.onmessage = (event: MessageEvent) => {
          if (event.data.type === 'ready') {
            state.ready = true;
            resolve(state);
          }
        };

        worker.postMessage({ type: 'init', maps, monsters });
        this.workers.push(state);
      });
    });

    await Promise.all(initPromises);
  }

  /** 获取一个空闲 Worker */
  private getIdleWorker(): WorkerState | null {
    return this.workers.find(w => !w.busy && w.ready) ?? null;
  }

  /**
   * 运行 Monte Carlo 模拟
   * 将 numTrials 平均分配给所有 Worker 并行执行，汇总结果
   */
  async simulate(mapId: string, numTrials: number, seed: number): Promise<SimulationResult> {
    if (this.workers.length === 0) throw new Error('WorkerPool 未初始化，请先调用 init()');

    const trialsPerWorker = Math.ceil(numTrials / this.numWorkers);
    let completedWorkers = 0;

    const partialResults = await Promise.all(
      this.workers.map((state, i) => {
        const trials = i === this.numWorkers - 1
          ? numTrials - trialsPerWorker * (this.numWorkers - 1)
          : trialsPerWorker;
        const workerSeed = seed + i * 1000;

        return new Promise<SimulationResult>((resolve, reject) => {
          state.busy = true;
          const prevOnMessage = state.worker.onmessage;

          state.worker.onmessage = (event: MessageEvent) => {
            if (event.data.type === 'result') {
              state.busy = false;
              completedWorkers++;
              if (this.onProgress) {
                this.onProgress(Math.round((completedWorkers / this.numWorkers) * 100));
              }
              resolve(event.data.data as SimulationResult);
            } else if (event.data.type === 'error') {
              state.busy = false;
              reject(new Error(event.data.message));
            }
          };

          state.worker.postMessage({ type: 'simulate', mapId, numTrials: trials, seed: workerSeed });
        });
      })
    );

    // 汇总所有 Worker 的结果（加权平均）
    return this.mergeResults(partialResults, numTrials);
  }

  /**
   * 低精度快速运行（用于优化迭代）
   * 使用 2000 次 MC，只用第一个 Worker
   */
  async optimizationRun(mapId: string, numTrials: number = 2000, seed: number = 42): Promise<SimulationResult> {
    if (this.workers.length === 0) throw new Error('WorkerPool 未初始化');

    const state = this.workers[0];

    return new Promise<SimulationResult>((resolve, reject) => {
      state.busy = true;

      state.worker.onmessage = (event: MessageEvent) => {
        if (event.data.type === 'result') {
          state.busy = false;
          resolve(event.data.data as SimulationResult);
        } else if (event.data.type === 'error') {
          state.busy = false;
          reject(new Error(event.data.message));
        }
      };

      state.worker.postMessage({ type: 'simulate', mapId, numTrials, seed });
    });
  }

  /** 合并多个 Worker 的部分结果（加权平均） */
  private mergeResults(results: SimulationResult[], totalTrials: number): SimulationResult {
    if (results.length === 0) throw new Error('没有结果可合并');
    if (results.length === 1) return results[0];

    const first = results[0];
    const numWaves = first.numWaves;
    const numMonsters = first.outdoorExpected[0].length;

    const outdoorExpected: number[][] = Array.from({ length: numWaves }, () => new Array(numMonsters).fill(0));
    const indoorExpected: number[][] = Array.from({ length: numWaves }, () => new Array(numMonsters).fill(0));
    const outdoorTotal: number[] = new Array(numWaves).fill(0);
    const indoorTotal: number[] = new Array(numWaves).fill(0);

    for (const result of results) {
      const weight = result.numTrials / totalTrials;
      for (let wave = 0; wave < numWaves; wave++) {
        for (let idx = 0; idx < numMonsters; idx++) {
          outdoorExpected[wave][idx] += result.outdoorExpected[wave][idx] * weight;
          indoorExpected[wave][idx] += result.indoorExpected[wave][idx] * weight;
        }
        outdoorTotal[wave] += result.outdoorTotal[wave] * weight;
        indoorTotal[wave] += result.indoorTotal[wave] * weight;
      }
    }

    return {
      mapId: first.mapId,
      numTrials: totalTrials,
      numWaves,
      outdoorExpected,
      indoorExpected,
      outdoorTotal,
      indoorTotal,
    };
  }

  /** 终止所有 Worker */
  terminate(): void {
    this.workers.forEach(w => w.worker.terminate());
    this.workers = [];
  }
}
