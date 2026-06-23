/** 怪物显示名称 — 覆盖 Excel 中所有可能的 ID（英文 monster_class + 中文 monster_table） */
export const MONSTER_NAMES: Record<string, string> = {
  // 英文 ID（来自 map.xlsx monster_class 列）
  'BansheeGirl': '蕉叶女妖',
  'Stitcher': '缝补匠',
  'Spider': '蜘蛛',
  'Doll': '木偶',
  'WastelandHound': '废墟恶犬',
  'SandRat': '沙鼠',
  'Ghoul': '食尸鬼',
  'LittleRascal': '流氓猫',
  // 中文 ID（来自 monster.xlsx id 列）
  '蕉叶女妖': '蕉叶女妖',
  '缝补匠': '缝补匠',
  '蜘蛛': '蜘蛛',
  '木偶': '木偶',
  '废墟恶犬': '废墟恶犬',
  '沙鼠': '沙鼠',
  '食尸鬼': '食尸鬼',
  '流氓猫': '流氓猫',
  // 常见 Excel 占位名映射
  'monsterName.1': '蕉叶女妖',
  'monsterName.2': '缝补匠',
  'monsterName.3': '蜘蛛',
  'monsterName.4': '木偶',
  'monsterName.5': '废墟恶犬',
  'monsterName.6': '沙鼠',
  'monsterName.7': '食尸鬼',
  'monsterName.8': '流氓猫',
  // 常见错别字 / 变体
  '少良': '沙鼠',
  '丧尸鬼': '食尸鬼',
  '流浪猫': '流氓猫',
};

/** 怪物曲线颜色（ECharts 友好） */
export const MONSTER_COLORS: string[] = [
  '#5470c6', // 蕉叶女妖 - 蓝
  '#91cc75', // 缝补匠 - 绿
  '#fac858', // 蜘蛛 - 黄
  '#ee6666', // 木偶 - 红
  '#73c0de', // 废墟恶犬 - 浅蓝
  '#3ba272', // 沙鼠 - 深绿
  '#aaaaaa', // 食尸鬼 - 灰（不可生成）
  '#fc8452', // LittleRascal - 橙
];

/** 难度显示名称 */
export const DIFFICULTY_NAMES: Record<string, string> = {
  'C': 'C 级',
  'B': 'B 级',
  'A': 'A 级',
  'S': 'S 级',
};

/** 区域显示名称 */
export const REGION_NAMES: Record<string, string> = {
  'Castle': '城堡',
  'Bloodmoon_Castle': '血月城堡',
};
