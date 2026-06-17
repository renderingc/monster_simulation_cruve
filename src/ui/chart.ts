import * as echarts from 'echarts';
import type { SimulationResult, Monster } from '../types';
import { MONSTER_COLORS, MONSTER_NAMES } from '../constants';

export class CurveChart {
  private chart: echarts.ECharts;
  private currentResult: SimulationResult | null = null;
  private currentMonsters: Monster[] = [];
  private currentPool: 'indoor' | 'outdoor' = 'indoor';

  constructor(container: HTMLElement) {
    this.chart = echarts.init(container);
    window.addEventListener('resize', () => this.chart.resize());
  }

  /** 渲染曲线图 */
  renderCurves(result: SimulationResult, monsters: Monster[], pool: 'indoor' | 'outdoor'): void {
    this.currentResult = result;
    this.currentMonsters = monsters;
    this.currentPool = pool;

    const data = pool === 'indoor' ? result.indoorExpected : result.outdoorExpected;
    const numWaves = result.numWaves;
    const xData = Array.from({ length: numWaves }, (_, i) => i);

    const series = monsters.map((m, idx) => ({
      name: MONSTER_NAMES[m.id] ?? m.name,
      type: 'line' as const,
      smooth: false,
      data: data.map(waveData => waveData[idx]),
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
            html += `${p.marker}${p.seriesName}: ${Number(p.value).toFixed(2)}<br/>`;
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
        name: '期望场上数量',
        min: 0,
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
