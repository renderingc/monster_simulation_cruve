import type { MapConfig, Monster, SimulationResult } from '../types';
import { monteCarloSimulate } from '../engine/simulation';

interface InitMessage {
  type: 'init';
  maps: MapConfig[];
  monsters: Monster[];
}

interface SimulateMessage {
  type: 'simulate';
  mapId: string;
  numTrials: number;
  seed: number;
}

type WorkerMessage = InitMessage | SimulateMessage;

let storedMaps: MapConfig[] = [];
let storedMonsters: Monster[] = [];

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    storedMaps = msg.maps;
    storedMonsters = msg.monsters;
    self.postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'simulate') {
    const mapCfg = storedMaps.find(m => m.mapId === msg.mapId);
    if (!mapCfg) {
      self.postMessage({ type: 'error', message: `地图 "${msg.mapId}" 未找到` });
      return;
    }

    const result = monteCarloSimulate(mapCfg, storedMonsters, msg.numTrials, msg.seed);
    self.postMessage({ type: 'result', data: result });
  }
};
