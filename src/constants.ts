/** 怪物显示名称（中文） */
export const MONSTER_NAMES: Record<string, string> = {
  '蕉叶女妖': '蕉叶女妖',
  '缝补匠': '缝补匠',
  '蜘蛛': '蜘蛛',
  '木偶': '木偶',
  '废墟恶犬': '废墟恶犬',
  '沙鼠': '沙鼠',
  '食尸鬼': '食尸鬼',
  'LittleRascal': '流氓猫',
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
