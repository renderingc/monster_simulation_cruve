import * as XLSX from 'xlsx';
import type { MapConfig, Monster } from '../types';

/** 解析管道分隔的浮点数列表 */
function parseFloatList(s: string): number[] {
  if (!s || !s.trim()) return [];
  return s.trim().split('|').map(p => {
    const v = parseFloat(p.trim());
    return isNaN(v) ? 0.0 : v;
  });
}

/** 从 sheet 的第一行（##var 行）获取列名到索引的映射 */
function getColumnMap(rows: any[][]): Record<string, number> {
  if (rows.length === 0) throw new Error('Sheet 为空');
  const headerRow = rows[0];
  const map: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const name = headerRow[i];
    if (name != null && String(name).trim()) {
      map[String(name).trim()] = i;
    }
  }
  return map;
}

/** 检查必需列是否存在 */
function requireColumn(colMap: Record<string, number>, colName: string): number {
  if (!(colName in colMap)) {
    throw new Error(`Excel 缺少必需列: "${colName}"`);
  }
  return colMap[colName];
}

/** 判断是否为注释行（以 ## 开头） */
function isCommentRow(row: any[]): boolean {
  if (!row || row.length === 0) return true;
  const first = row[0];
  return first != null && String(first).trim().startsWith('##');
}

/**
 * 解析 map_table sheet，返回 MapConfig 列表
 */
export function parseMapTable(workbook: XLSX.WorkBook): MapConfig[] {
  const sheet = workbook.Sheets['map_table'];
  if (!sheet) throw new Error('Excel 中未找到 map_table sheet');

  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  if (rows.length < 2) throw new Error('map_table sheet 数据不足');

  // 第一行是 ##var 行，获取列名映射
  const colMap = getColumnMap(rows);

  // 验证必需列
  const mapIdCol = requireColumn(colMap, 'map_id');
  const regionIdCol = requireColumn(colMap, 'region_id');
  const difficultyCol = requireColumn(colMap, 'difficulty');
  const genProbCol = requireColumn(colMap, 'gen_prob');
  const outdoorWeightCol = requireColumn(colMap, 'outdoor_total_weight');
  const indoorWeightCol = requireColumn(colMap, 'indoor_total_weight');
  const spawnCycleCol = requireColumn(colMap, 'monster_spawn_cycle');
  const gameDurationCol = requireColumn(colMap, 'game_duration');

  const maps: MapConfig[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (isCommentRow(row)) continue;

    const mapId = row[mapIdCol] != null ? String(row[mapIdCol]).trim() : '';
    if (!mapId) continue;

    // 过滤 Tutorial_* 和 Hall 地图
    if (mapId.startsWith('Tutorial_') || mapId === 'Hall') continue;

    const regionId = row[regionIdCol] != null ? String(row[regionIdCol]).trim() : '';
    const difficulty = row[difficultyCol] != null ? String(row[difficultyCol]).trim() : '';
    const genProbStr = row[genProbCol] != null ? String(row[genProbCol]) : '';
    const genProb = parseFloatList(genProbStr);
    const outdoorTotalWeight = row[outdoorWeightCol] != null ? parseFloat(String(row[outdoorWeightCol])) : 10;
    const indoorTotalWeight = row[indoorWeightCol] != null ? parseFloat(String(row[indoorWeightCol])) : 10;
    const spawnCycle = row[spawnCycleCol] != null ? parseFloat(String(row[spawnCycleCol])) : 60;
    const gameDuration = row[gameDurationCol] != null ? parseFloat(String(row[gameDurationCol])) : 900;
    const numWaves = Math.floor(gameDuration / spawnCycle) + 1;

    maps.push({
      mapId,
      regionId,
      difficulty,
      genProb,
      outdoorTotalWeight,
      indoorTotalWeight,
      spawnCycle,
      gameDuration,
      numWaves,
    });
  }

  return maps;
}

/**
 * 解析 monster_table sheet，返回 Monster 列表
 * @param workbook SheetJS workbook
 * @param monsterIds 按顺序排列的怪物 ID 列表（从 monster_class 列获取）
 */
export function parseMonsterTable(workbook: XLSX.WorkBook, monsterIds: string[]): Monster[] {
  const sheet = workbook.Sheets['monster_table'];
  if (!sheet) throw new Error('Excel 中未找到 monster_table sheet');

  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  if (rows.length < 2) throw new Error('monster_table sheet 数据不足');

  // 第一行是 ##var 行，获取列名映射
  const colMap = getColumnMap(rows);

  // 验证必需列
  const idCol = requireColumn(colMap, 'id');
  const nameCol = colMap['name'] ?? -1;
  const maxNumCol = requireColumn(colMap, 'max_num');
  const maxNumGeneratedCol = requireColumn(colMap, 'max_num_generated');
  const monsterWeightCol = requireColumn(colMap, 'monster_weight');
  const timeWeightCol = requireColumn(colMap, 'monster_time_weight');
  const numWeightCol = requireColumn(colMap, 'monster_num_weight');
  const bornPosTypeCol = requireColumn(colMap, 'born_pos_type');

  // 构建 id -> 行数据 的映射
  const idToRow: Record<string, any[]> = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (isCommentRow(row)) continue;
    const id = row[idCol] != null ? String(row[idCol]).trim() : '';
    if (id) idToRow[id] = row;
  }

  // 按 monsterIds 顺序构建 Monster 列表
  const result: Monster[] = [];
  for (let idx = 0; idx < monsterIds.length; idx++) {
    const id = monsterIds[idx];
    const row = idToRow[id];
    if (!row) {
      throw new Error(`怪物 "${id}" 未在 monster_table 中找到。可用 ID: ${Object.keys(idToRow).join(', ')}`);
    }

    const timeWeightStr = row[timeWeightCol] != null ? String(row[timeWeightCol]) : '';
    const numWeightStr = row[numWeightCol] != null ? String(row[numWeightCol]) : '';
    const bornPosTypeRaw = row[bornPosTypeCol] != null ? parseInt(String(row[bornPosTypeCol])) : 1;
    const bornPosType = (bornPosTypeRaw === 1 || bornPosTypeRaw === 2 || bornPosTypeRaw === 3)
      ? bornPosTypeRaw as 1 | 2 | 3
      : 1;

    result.push({
      idx,
      id,
      name: nameCol >= 0 && row[nameCol] != null ? String(row[nameCol]).trim() : id,
      monsterWeight: row[monsterWeightCol] != null ? parseFloat(String(row[monsterWeightCol])) : 1.0,
      timeWeight: parseFloatList(timeWeightStr),
      numWeight: parseFloatList(numWeightStr),
      maxNum: row[maxNumCol] != null ? parseInt(String(row[maxNumCol])) : 99,
      maxNumGenerated: row[maxNumGeneratedCol] != null ? parseInt(String(row[maxNumGeneratedCol])) : -1,
      bornPosType,
    });
  }

  return result;
}

/**
 * 从两个 Excel 文件加载地图和怪物配置
 */
export async function loadExcelFiles(
  mapFile: File,
  monsterFile: File
): Promise<{ maps: MapConfig[]; monsters: Monster[]; monsterIds: string[] }> {
  const readFile = (file: File): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target!.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

  const [mapBuffer, monsterBuffer] = await Promise.all([
    readFile(mapFile),
    readFile(monsterFile),
  ]);

  const mapWorkbook = XLSX.read(mapBuffer, { type: 'array' });
  const monsterWorkbook = XLSX.read(monsterBuffer, { type: 'array' });

  // 先解析地图，从第一张地图的 monster_class 列获取怪物 ID 列表
  const maps = parseMapTable(mapWorkbook);
  if (maps.length === 0) throw new Error('未找到有效地图数据');

  // 从 map_table 中提取 monster_class 列表
  const mapSheet = mapWorkbook.Sheets['map_table'];
  const mapRows = XLSX.utils.sheet_to_json<any[]>(mapSheet, { header: 1 });
  const mapColMap = getColumnMap(mapRows);
  const monsterClassCol = requireColumn(mapColMap, 'monster_class');

  let monsterIds: string[] = [];
  for (let i = 1; i < mapRows.length; i++) {
    const row = mapRows[i];
    if (!row || isCommentRow(row)) continue;
    const classStr = row[monsterClassCol] != null ? String(row[monsterClassCol]) : '';
    if (classStr.includes('|')) {
      monsterIds = classStr.split('|').map(s => s.trim()).filter(Boolean);
      break;
    }
  }

  if (monsterIds.length === 0) throw new Error('未能从 map_table 中提取 monster_class 列表');

  const monsters = parseMonsterTable(monsterWorkbook, monsterIds);

  return { maps, monsters, monsterIds };
}
