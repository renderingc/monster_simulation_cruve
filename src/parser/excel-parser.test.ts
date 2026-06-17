import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseMapTable, parseMonsterTable } from './excel-parser';

/** 构造 map_table mock workbook */
function createMockMapWorkbook() {
  const data = [
    // ##var 行（列名）
    ['map_id', 'region_id', 'difficulty', 'monster_class', 'gen_prob',
     'outdoor_total_weight', 'indoor_total_weight', 'monster_spawn_cycle', 'game_duration'],
    // ##type 注释行（应跳过）
    ['##type', 'str', 'str', 'str', 'str', 'float', 'float', 'float', 'float'],
    // Tutorial 地图（应过滤）
    ['Tutorial_001', 'Tutorial', 'C', 'BansheeGirl|Stitcher|Spider|Doll|WastelandHound|SandRat|Ghoul|LittleRascal',
     '2.5|3|2|2|1|2|0|1', '10', '10', '60', '900'],
    // Hall 地图（应过滤）
    ['Hall', 'Hall', 'C', 'BansheeGirl|Stitcher|Spider|Doll|WastelandHound|SandRat|Ghoul|LittleRascal',
     '2.5|3|2|2|1|2|0|1', '10', '10', '60', '900'],
    // 有效地图
    ['Castle_001', 'Castle', 'C', 'BansheeGirl|Stitcher|Spider|Doll|WastelandHound|SandRat|Ghoul|LittleRascal',
     '2.5|3|2|2|1|2|0|1', '10', '15', '60', '900'],
    ['Castle_002', 'Castle', 'B', 'BansheeGirl|Stitcher|Spider|Doll|WastelandHound|SandRat|Ghoul|LittleRascal',
     '3|3|2|2|1|2|0|1', '10', '15', '60', '900'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'map_table');
  return wb;
}

/** 构造 monster_table mock workbook */
function createMockMonsterWorkbook() {
  const data = [
    // ##var 行（列名）
    ['id', 'name', 'max_num', 'max_num_generated', 'monster_weight',
     'monster_time_weight', 'monster_num_weight', 'born_pos_type'],
    // ##type 注释行（应跳过）
    ['##type', 'str', 'int', 'int', 'float', 'str', 'str', 'int'],
    // 怪物数据
    ['BansheeGirl', '蕉叶女妖', '2', '-1', '3', '0|0|0.5|1|1', '1|0.5', '1'],
    ['Stitcher', '缝补匠', '1', '-1', '3', '0|0|0|0.5|1|1', '1', '1'],
    ['Spider', '蜘蛛', '2', '-1', '3', '1|1|1|1|1', '1|0.8', '1'],
    ['Doll', '木偶', '2', '-1', '3', '0|0|0|0.5|1|1', '1|0.5', '1'],
    ['WastelandHound', '废墟恶犬', '3', '-1', '3', '1|1|1|1|1', '1|0.8|0.5', '2'],
    ['SandRat', '沙鼠', '2', '-1', '2', '0|0|0.5|1|1', '1|0.5', '1'],
    ['Ghoul', '食尸鬼', '2', '-1', '3', '1|1|1|1|1', '1|0.5', '1'],
    ['LittleRascal', '流氓猫', '1', '3', '2', '0|0|0|0.5|1|1', '1', '1'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'monster_table');
  return wb;
}

describe('parseMapTable', () => {
  it('应正确解析地图配置', () => {
    const wb = createMockMapWorkbook();
    const maps = parseMapTable(wb);

    // 应过滤掉 Tutorial_001 和 Hall，只剩 2 张地图
    expect(maps).toHaveLength(2);
    expect(maps[0].mapId).toBe('Castle_001');
    expect(maps[0].regionId).toBe('Castle');
    expect(maps[0].difficulty).toBe('C');
  });

  it('应正确解析 gen_prob 管道分隔数组', () => {
    const wb = createMockMapWorkbook();
    const maps = parseMapTable(wb);

    expect(maps[0].genProb).toEqual([2.5, 3, 2, 2, 1, 2, 0, 1]);
  });

  it('应正确计算 numWaves', () => {
    const wb = createMockMapWorkbook();
    const maps = parseMapTable(wb);

    // numWaves = Math.floor(900 / 60) + 1 = 16
    expect(maps[0].numWaves).toBe(16);
  });

  it('应正确解析权值上限', () => {
    const wb = createMockMapWorkbook();
    const maps = parseMapTable(wb);

    expect(maps[0].outdoorTotalWeight).toBe(10);
    expect(maps[0].indoorTotalWeight).toBe(15);
  });

  it('缺少必需列时应抛出包含列名的错误', () => {
    // 构造缺少 gen_prob 列的 workbook
    const data = [
      ['map_id', 'region_id', 'difficulty', 'outdoor_total_weight', 'indoor_total_weight', 'monster_spawn_cycle', 'game_duration'],
      ['Castle_001', 'Castle', 'C', '10', '15', '60', '900'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'map_table');

    expect(() => parseMapTable(wb)).toThrow('gen_prob');
  });

  it('应跳过注释行（## 开头）', () => {
    const wb = createMockMapWorkbook();
    const maps = parseMapTable(wb);
    // 确认没有 ##type 行被解析为地图
    expect(maps.every(m => !m.mapId.startsWith('##'))).toBe(true);
  });
});

describe('parseMonsterTable', () => {
  const monsterIds = ['BansheeGirl', 'Stitcher', 'Spider', 'Doll', 'WastelandHound', 'SandRat', 'Ghoul', 'LittleRascal'];

  it('应正确解析怪物配置', () => {
    const wb = createMockMonsterWorkbook();
    const monsters = parseMonsterTable(wb, monsterIds);

    expect(monsters).toHaveLength(8);
    expect(monsters[0].id).toBe('BansheeGirl');
    expect(monsters[0].name).toBe('蕉叶女妖');
    expect(monsters[0].idx).toBe(0);
  });

  it('应正确解析 timeWeight 管道分隔数组', () => {
    const wb = createMockMonsterWorkbook();
    const monsters = parseMonsterTable(wb, monsterIds);

    expect(monsters[2].id).toBe('Spider');
    expect(monsters[2].timeWeight).toEqual([1, 1, 1, 1, 1]);
  });

  it('应正确解析 bornPosType', () => {
    const wb = createMockMonsterWorkbook();
    const monsters = parseMonsterTable(wb, monsterIds);

    // WastelandHound 是室外（bornPosType=2）
    expect(monsters[4].id).toBe('WastelandHound');
    expect(monsters[4].bornPosType).toBe(2);
    // 其他是室内（bornPosType=1）
    expect(monsters[0].bornPosType).toBe(1);
  });

  it('应正确解析 maxNumGenerated（-1 表示无限）', () => {
    const wb = createMockMonsterWorkbook();
    const monsters = parseMonsterTable(wb, monsterIds);

    expect(monsters[0].maxNumGenerated).toBe(-1);
    expect(monsters[7].maxNumGenerated).toBe(3); // LittleRascal
  });

  it('怪物 ID 不存在时应抛出错误', () => {
    const wb = createMockMonsterWorkbook();
    expect(() => parseMonsterTable(wb, ['NonExistentMonster'])).toThrow('NonExistentMonster');
  });
});
