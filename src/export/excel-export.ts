import * as XLSX from 'xlsx';
import type { Monster, OptimizationResult } from '../types';

/**
 * 自动识别哪个文件是 map、哪个是 monster
 */
export function identifyExcelFiles(files: File[]): { mapFile: File | null; monsterFile: File | null } {
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

  if (!mapFile && !monsterFile && files.length === 2) {
    mapFile = files[0];
    monsterFile = files[1];
  }

  return { mapFile, monsterFile };
}

/**
 * 在原始 monster.xlsx 上修改 monster_time_weight，
 * 弹出系统保存对话框让用户选择保存位置。
 * 不支持 showSaveFilePicker 的浏览器降级为直接下载。
 *
 * @param monsterBuffer 原始 monster.xlsx 的 ArrayBuffer
 * @param originalMonsters 修改前的怪物数据
 * @param changes 优化结果（timeWeight 修改建议）
 * @param originalFileName 原始文件名（用于保存对话框建议名）
 */
export async function exportModifiedMonsterExcel(
  monsterBuffer: ArrayBuffer,
  originalMonsters: Monster[],
  changes: OptimizationResult,
  originalFileName: string
): Promise<void> {
  // 1. 加载原始 workbook
  const wb = XLSX.read(monsterBuffer, { type: 'array' });
  const sheet = wb.Sheets['monster_table'];
  if (!sheet) throw new Error('monster.xlsx 中未找到 monster_table sheet');

  // 2. 获取所有行
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  if (rows.length < 1) throw new Error('monster_table sheet 为空');

  // 3. 找到列索引
  const headerRow = rows[0];
  let idCol = -1;
  let timeWeightCol = -1;
  for (let i = 0; i < headerRow.length; i++) {
    const name = String(headerRow[i] ?? '').trim();
    if (name === 'id') idCol = i;
    if (name === 'monster_time_weight') timeWeightCol = i;
  }
  if (idCol === -1) throw new Error('monster_table sheet 缺少 id 列');
  if (timeWeightCol === -1) throw new Error('monster_table sheet 缺少 monster_time_weight 列');

  // 4. 构建 timeWeight 修改映射
  const timeWeightChanges = new Map<number, number[]>();
  for (const change of changes.timeWeightChanges) {
    timeWeightChanges.set(change.monsterIdx, change.newValues);
  }

  // 如果没有 timeWeight 修改，直接返回
  if (timeWeightChanges.size === 0) {
    alert('没有 time_weight 参数需要修改');
    return;
  }

  // 5. 构建 id → monsterIdx 映射
  const idToIdx = new Map<string, number>();
  for (const m of originalMonsters) {
    idToIdx.set(m.id, m.idx);
  }

  // 6. 遍历行，找到对应怪物并修改
  let modifiedCount = 0;
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row || row.length === 0) continue;
    // 跳过注释行
    const firstCol = row[0];
    if (firstCol != null && String(firstCol).trim().startsWith('##')) continue;

    const monsterId = String(row[idCol] ?? '').trim();
    if (!monsterId) continue;

    const idx = idToIdx.get(monsterId);
    if (idx === undefined || !timeWeightChanges.has(idx)) continue;

    // 修改 monster_time_weight 列
    const newValues = timeWeightChanges.get(idx)!;
    row[timeWeightCol] = newValues.join('|');
    modifiedCount++;
  }

  if (modifiedCount === 0) {
    alert('未能在 monster_table 中找到需要修改的怪物行');
    return;
  }

  // 7. 将修改后的行写回 sheet
  const newSheet = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets['monster_table'] = newSheet;

  // 8. 写入文件：优先使用系统保存对话框，降级为浏览器下载
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: originalFileName,
        types: [{
          description: 'Excel 文件',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(wbout);
      await writable.close();
      return;
    } catch (err: any) {
      // 用户取消保存对话框，或 API 调用失败 → 降级为下载
      if (err.name === 'AbortError') return;
    }
  }

  // 降级：浏览器直接下载
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = originalFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
