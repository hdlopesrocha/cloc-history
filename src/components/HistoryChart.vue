<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { escapeHtml, formatCompact, formatDate, formatNumber } from '../utils/format.js';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

const props = defineProps({
  commits: { type: Array, required: true },
  languages: { type: Array, required: true },
  metric: { type: String, required: true },
  chartType: { type: String, default: 'area' },
  theme: { type: String, default: 'dark' },
});

const container = ref(null);
let chart = null;
let resizeObserver = null;

const isDark = computed(() => props.theme !== 'light');

function commitTime(commit) {
  return new Date(commit.date).getTime();
}

function languageValue(commit, name) {
  const language = commit.languages.find((entry) => entry.name === name);
  if (!language) return 0;
  if (props.metric === 'lines') return language.code + language.comment + language.blank;
  return language[props.metric] ?? 0;
}

function tooltipFormatter(params) {
  const index = params?.[0]?.dataIndex;
  const commit = props.commits[index];
  if (!commit) return '';

  const rows = params
    .map((param) => ({
      name: param.seriesName,
      color: param.color,
      value: Number(Array.isArray(param.value) ? param.value[1] : param.value) || 0,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const list = rows.length
    ? rows.map((row) => `
        <div class="chart-tip-row">
          <span class="chart-tip-swatch" style="background:${escapeHtml(row.color)}"></span>
          <span class="chart-tip-name">${escapeHtml(row.name)}</span>
          <span class="chart-tip-value">${formatNumber(row.value)}</span>
        </div>`).join('')
    : '<div class="chart-tip-empty">No visible lines at this commit.</div>';
  const hasChurn = Number.isFinite(commit.changes?.added) || Number.isFinite(commit.changes?.deleted);
  const churn = hasChurn
    ? `<div class="chart-tip-churn">
        <span class="added">+${formatNumber(commit.changes?.added ?? 0)} added</span>
        <span class="deleted">−${formatNumber(commit.changes?.deleted ?? 0)} deleted</span>
      </div>`
    : '';

  return `
    <div class="chart-tip">
      <div class="chart-tip-heading">
        <span>${escapeHtml(formatDate(commit.date))}</span>
        <code>${escapeHtml(commit.shortSha)}</code>
      </div>
      <div class="chart-tip-subject">${escapeHtml(commit.subject)}</div>
      <div class="chart-tip-author">${escapeHtml(commit.author)}</div>
      ${churn}
      <div class="chart-tip-list">${list}</div>
      <div class="chart-tip-total">
        <span>Visible total</span>
        <strong>${formatNumber(total)}</strong>
      </div>
    </div>
  `;
}

function buildOption() {
  const dark = isDark.value;
  const axisLabel = dark ? 'rgba(207, 228, 216, 0.58)' : 'rgba(35, 52, 44, 0.64)';
  const splitLine = dark ? 'rgba(207, 228, 216, 0.085)' : 'rgba(35, 52, 44, 0.09)';
  const tooltipBackground = dark ? 'rgba(12, 23, 18, 0.96)' : 'rgba(255, 253, 247, 0.98)';
  const tooltipBorder = dark ? 'rgba(207, 228, 216, 0.14)' : 'rgba(35, 52, 44, 0.12)';

  const series = props.languages.map((language) => {
    const data = props.commits.map((commit) => [commitTime(commit), languageValue(commit, language.name)]);
    if (props.chartType === 'bar') {
      return {
        name: language.name,
        type: 'bar',
        stack: 'total',
        data,
        barMaxWidth: 18,
        itemStyle: { color: language.color, borderRadius: 1.5 },
        emphasis: { focus: 'series' },
        animationDelay: (index) => index * 1.2,
      };
    }

    return {
      name: language.name,
      type: 'line',
      stack: 'total',
      data,
      smooth: false,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 4,
      sampling: 'lttb',
      lineStyle: {
        color: language.color,
        width: props.chartType === 'area' ? 1.2 : 1.7,
      },
      itemStyle: { color: language.color },
      areaStyle: props.chartType === 'area'
        ? { color: language.color, opacity: 0.37 }
        : undefined,
      emphasis: { focus: 'series' },
      animationDelay: (index) => index * 1.2,
    };
  });

  return {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 450,
    animationEasing: 'cubicOut',
    textStyle: {
      fontFamily: 'Inter, "Avenir Next", "Segoe UI", sans-serif',
    },
    grid: {
      top: 16,
      left: 12,
      right: 18,
      bottom: 66,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: tooltipBackground,
      borderColor: tooltipBorder,
      borderWidth: 1,
      padding: 0,
      extraCssText: 'border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.22); overflow: hidden;',
      axisPointer: {
        type: props.chartType === 'bar' ? 'shadow' : 'line',
        lineStyle: { color: dark ? 'rgba(211, 255, 178, 0.3)' : 'rgba(32, 82, 54, 0.25)' },
        shadowStyle: { color: dark ? 'rgba(255,255,255,.025)' : 'rgba(24, 61, 43, .035)' },
      },
      formatter: tooltipFormatter,
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLine: {
        lineStyle: { color: splitLine },
      },
      axisTick: { show: false },
      axisLabel: {
        color: axisLabel,
        fontSize: 10.5,
        margin: 14,
        hideOverlap: true,
        formatter: {
          year: '{yyyy}',
          month: '{MMM} {yyyy}',
          day: '{MMM} {d}',
          hour: '{HH}:{mm}',
          minute: '{HH}:{mm}',
          second: '{HH}:{mm}:{ss}',
          millisecond: '{HH}:{mm}:{ss}.{S}',
        },
      },
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axisLabel,
        fontSize: 10.5,
        formatter: (value) => formatCompact(value),
      },
      splitLine: {
        lineStyle: { color: splitLine, type: [4, 5] },
      },
    },
    dataZoom: [
      {
        type: 'inside',
        filterMode: 'none',
        zoomOnMouseWheel: 'shift',
        moveOnMouseMove: true,
      },
      {
        type: 'slider',
        height: 24,
        bottom: 8,
        borderColor: 'transparent',
        backgroundColor: dark ? 'rgba(255,255,255,.025)' : 'rgba(20,48,35,.035)',
        fillerColor: dark ? 'rgba(191, 245, 124, 0.11)' : 'rgba(52, 122, 81, 0.1)',
        dataBackground: {
          lineStyle: { color: dark ? 'rgba(208, 232, 218, 0.18)' : 'rgba(42, 75, 58, 0.2)', width: 1 },
          areaStyle: { color: dark ? 'rgba(208, 232, 218, 0.045)' : 'rgba(42, 75, 58, 0.06)' },
        },
        selectedDataBackground: {
          lineStyle: { color: dark ? 'rgba(191, 245, 124, 0.48)' : 'rgba(52, 122, 81, 0.55)', width: 1 },
          areaStyle: { color: dark ? 'rgba(191, 245, 124, 0.09)' : 'rgba(52, 122, 81, 0.08)' },
        },
        handleStyle: {
          color: dark ? '#25382e' : '#f8f5ea',
          borderColor: dark ? 'rgba(191,245,124,.55)' : 'rgba(48,108,75,.5)',
          borderWidth: 1,
        },
        moveHandleStyle: {
          color: dark ? 'rgba(191,245,124,.28)' : 'rgba(48,108,75,.25)',
        },
        textStyle: { color: axisLabel, fontSize: 9 },
        brushSelect: false,
      },
    ],
    series,
  };
}

function renderChart() {
  if (!chart) return;
  if (!props.commits.length) {
    chart.clear();
    return;
  }
  const previousZoom = chart.getOption()?.dataZoom?.[0];
  const option = buildOption();
  if (previousZoom && Number.isFinite(previousZoom.start)) {
    option.dataZoom[0].start = previousZoom.start;
    option.dataZoom[0].end = previousZoom.end;
  }
  chart.setOption(option, { notMerge: true });
}

function resize() {
  chart?.resize();
}

onMounted(async () => {
  await nextTick();
  if (!container.value) return;
  chart = echarts.init(container.value, null, { renderer: 'canvas' });
  renderChart();
  resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container.value);
});

watch(
  () => [props.commits, props.languages, props.metric, props.chartType, props.theme],
  () => {
    renderChart();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function downloadPng({ backgroundColor = '#0c1713', title = 'Codebase history', subtitle = '', theme = props.theme } = {}) {
  if (!chart || !props.commits.length || !props.languages.length) return null;

  const dark = theme !== 'light';
  const axisLabel = dark ? 'rgba(207, 228, 216, 0.6)' : 'rgba(35, 52, 44, 0.66)';
  const titleColor = dark ? '#edf5ef' : '#18251f';

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-100000px;top:0;width:1440px;height:840px;';
  document.body.appendChild(container);

  let exportChart = null;
  try {
    exportChart = echarts.init(container, null, { renderer: 'canvas' });
    const option = buildOption();
    option.animation = false;
    option.backgroundColor = backgroundColor;
    option.tooltip = { show: false };
    option.dataZoom = [];
    option.grid = {
      top: 142,
      left: 26,
      right: 28,
      bottom: 42,
      containLabel: true,
    };
    option.title = {
      text: title,
      subtext: subtitle,
      left: 26,
      top: 24,
      itemGap: 8,
      textStyle: {
        color: titleColor,
        fontSize: 24,
        fontWeight: 500,
        fontFamily: 'Inter, "Avenir Next", "Segoe UI", sans-serif',
      },
      subtextStyle: {
        color: axisLabel,
        fontSize: 11,
        fontFamily: 'Inter, "Avenir Next", "Segoe UI", sans-serif',
      },
    };
    option.legend = {
      type: 'plain',
      show: true,
      left: 26,
      right: 26,
      top: 96,
      itemGap: 15,
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
      textStyle: {
        color: axisLabel,
        fontSize: 11,
        fontFamily: 'Inter, "Avenir Next", "Segoe UI", sans-serif',
      },
    };
    exportChart.setOption(option, true);
    await waitForPaint();

    return exportChart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor,
    });
  } finally {
    exportChart?.dispose();
    container.remove();
  }
}

defineExpose({ downloadPng, resize });
</script>

<template>
  <div ref="container" class="history-chart" role="img" aria-label="Stacked timeline of lines by language" />
</template>

<style scoped>
.history-chart {
  width: 100%;
  height: 412px;
}

@media (max-width: 700px) {
  .history-chart {
    height: 330px;
  }
}
</style>
