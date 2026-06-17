import * as XLSX from 'xlsx';
import type { Monster, OptimizationResult, MapConfig } from '../types';
import { MONSTER_NAMES } from '../constants';

/**
 * 导出参数修改报告 Excel
 * Sheet1 "参数修改": 怪物名、参数类型、原值、新值
 * Sheet2 "验证曲线": 优化后的期望曲线数据
 */
export function exportModifiedExcel(
  originalMonsters: Monster[],
  changes: OptimizationResult,
  mapConfig: MapConfig
): void {
  const wb = XLSX.utils.book_new();

  // Sheet1: 参数修改
  const changeRows: any[][] = [
    ['怪物名称', '参数类型', '原值', '建议值', '地图ID'],
  ];

  for (const change of changes.timeWeightChanges) {
    const monster = originalMonsters[change.monsterIdx];
    const name = MONSTER_NAMES[monster.id] ?? monster.name;
    const origStr = monster.timeWeight.join('|');
    const newStr = change.newValues.join('|');
    changeRows.push([name, 'monster_time_weight', origStr, newStr, mapConfig.mapId]);
  }

  for (const change of changes.genProbChanges) {
    const monster = originalMonsters[change.monsterIdx];
    const name = MONSTER_NAMES[monster.id] ?? monster.name;
    const origVal = mapConfig.genProb[change.monsterIdx];
    changeRows.push([name, 'gen_prob', origVal, change.newValue, mapConfig.mapId]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(changeRows);
  XLSX.utils.book_append_sheet(wb, ws1, '参数修改');

  // Sheet2: 验证曲线
  const curveRows: any[][] = [
    ['波次', ...originalMonsters.map(m => MONSTER_NAMES[m.id] ?? m.name)],
  ];

  for (let wave = 0; wave < changes.verifiedCurve.length; wave++) {
    curveRows.push([wave, ...changes.verifiedCurve[wave]]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(curveRows);
  XLSX.utils.book_append_sheet(wb, ws2, '验证曲线');

  // 触发下载
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monster_params_${mapConfig.mapId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 自动识别哪个文件是 map、哪个是 monster
 * 通过检查 sheet 名称
 */
export function identifyExcelFiles(files: File[]): { mapFile: File | null; monsterFile: File | null } {
  // 这个函数在文件加载后通过 SheetJS 检查 sheet 名来识别
  // 简单策略：文件名包含 "map" 的是地图文件，包含 "monster" 的是怪物文件
  let mapFile: File | null = null;
  let monsterFile: File | null = null;

  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.includes('map')) {
      mapFile = file;
    } else if (name.includes('monster')) {
      monsterFile = file;
    }
  }

  // 如果文件名无法识别，按顺序分配
  if (!mapFile && !monsterFile && files.length === 2) {
    mapFile = files[0];
    monsterFile = files[1];
  }

  return { mapFile, monsterFile };
}
