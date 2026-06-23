import * as echarts from 'echarts';
import type { SimulationResult, Monster } from '../types';
import { MONSTER_COLORS, MONSTER_NAMES } from '../constants';

export class CurveChart {
  private chart: echarts.ECharts;
  private currentResult: SimulationResult | null = null;
  private currentMonsters: Monster[] = [];
  private currentPool: 'indoor' | 'outdoor' = 'indoor';
  private dataMode: 'count' | 'prob' = 'count';

  constructor(container: HTMLElement) {
    this.chart = echarts.init(container);
    window.addEventListener('resize', () => this.chart.resize());
  }

  /** 切换显示模式 */
  setDataMode(mode: 'count' | 'prob'): void {
    this.dataMode = mode;
    if (this.currentResult) {
      this.renderCurves(this.currentResult, this.currentMonsters, this.currentPool);
    }
  }

  /** 获取当前显示模式 */
  getDataMode(): 'count' | 'prob' {
    return this.dataMode;
  }

  /** 渲染曲线图 */
  renderCurves(result: SimulationResult, monsters: Monster[], pool: 'indoor' | 'outdoor'): void {
    this.currentResult = result;
    this.currentMonsters = monsters;
    this.currentPool = pool;

    const data = this.dataMode === 'prob'
      ? (pool === 'indoor' ? result.indoorSpawnProb : result.outdoorSpawnProb)
      : (pool === 'indoor' ? result.indoorExpected : result.outdoorExpected);
    const yAxisName = this.dataMode === 'prob' ? '生成概率' : '期望场上数量';
    const tooltipUnit = this.dataMode === 'prob' ? '%' : '';

    const numWaves = result.numWaves;
    const xData = Array.from({ length: numWaves }, (_, i) => i);

    const series = monsters.map((m, idx) => ({
      name: MONSTER_NAMES[m.id] ?? m.name,
      type: 'line' as const,
      smooth: false,
      data: data.map(waveData => this.dataMode === 'prob' ? +(waveData[idx] * 100).toFixed(1) : waveData[idx]),
      lineStyle: { color: MONSTER_COLORS[idx] },
      itemStyle: { color: MONSTER_COLORS[idx] },
      symbol: 'circle',
      symbolSize: 6,
    }));

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const wave = params[0].axisValue;
          let html = `第 ${wave} 波<br/>`;
          params.forEach((p: any) => {
            html += `${p.marker}${p.seriesName}: ${Number(p.value).toFixed(2)}${tooltipUnit}<br/>`;
          });
          return html;
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
      },
      grid: { top: 20, right: 20, bottom: 60, left: 50 },
      xAxis: {
        type: 'category',
        data: xData,
        name: '波次',
        nameLocation: 'end',
      },
      yAxis: {
        type: 'value',
        name: yAxisName,
        min: 0,
        max: this.dataMode === 'prob' ? 100 : undefined,
      },
      series,
    };

    this.chart.setOption(option, true);
  }

  /** 获取 ECharts 实例（供拖拽层使用） */
  getChart(): echarts.ECharts {
    return this.chart;
  }

  /** 获取当前渲染的数据 */
  getCurrentData(): { result: SimulationResult | null; monsters: Monster[]; pool: 'indoor' | 'outdoor' } {
    return { result: this.currentResult, monsters: this.currentMonsters, pool: this.currentPool };
  }

  /** 销毁图表 */
  dispose(): void {
    this.chart.dispose();
  }
}
