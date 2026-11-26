<script setup>
import { computed } from 'vue';
import { ArrowDownRight, ArrowUpRight } from 'lucide-vue-next';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  detail: { type: String, default: '' },
  icon: { type: Object, default: null },
  tint: { type: String, default: 'var(--accent)' },
  delta: { type: String, default: '' },
  deltaTone: { type: String, default: 'positive' },
  sparkline: { type: Array, default: () => [] },
  hint: { type: String, default: '' },
});

const geometry = computed(() => {
  const values = props.sparkline.filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;

  const width = 120;
  const height = 38;
  const padding = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return [x, y];
  });

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${width - padding},${height} L${padding},${height} Z`;
  return { line, area };
});
</script>

<template>
  <article class="stat-card" :title="hint || undefined">
    <div class="stat-topline">
      <span class="stat-label">{{ label }}</span>
      <span v-if="icon" class="stat-icon" :style="{ color: tint, background: `color-mix(in srgb, ${tint} 10%, transparent)` }">
        <component :is="icon" :size="16" :stroke-width="1.8" />
      </span>
    </div>

    <div class="stat-value">{{ value }}</div>

    <div class="stat-bottom">
      <span v-if="delta" class="stat-delta" :class="deltaTone">
        <ArrowUpRight v-if="deltaTone === 'positive'" :size="12" :stroke-width="2.2" />
        <ArrowDownRight v-else-if="deltaTone === 'negative'" :size="12" :stroke-width="2.2" />
        {{ delta }}
      </span>
      <span class="stat-detail">{{ detail }}</span>
    </div>

    <svg
      v-if="geometry"
      class="stat-sparkline"
      viewBox="0 0 120 38"
      preserveAspectRatio="none"
      aria-hidden="true"
      :style="{ color: tint }"
    >
      <path :d="geometry.area" fill="currentColor" opacity="0.09" />
      <path :d="geometry.line" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55" />
    </svg>
  </article>
</template>

<style scoped>
.stat-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 18px 19px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.022), transparent 55%),
    var(--panel);
  box-shadow: var(--shadow-sm);
}

.stat-card::after {
  position: absolute;
  right: -28px;
  bottom: -58px;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 5%, transparent), transparent 70%);
  content: '';
  pointer-events: none;
}

.stat-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stat-label {
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.stat-icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.stat-value {
  margin-top: 11px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: clamp(25px, 2.3vw, 32px);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.055em;
  line-height: 1.1;
}

.stat-bottom {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 18px;
  align-items: center;
  gap: 8px;
  margin-top: 9px;
  color: var(--text-faint);
  font-size: 11.5px;
}

.stat-delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.stat-delta.positive {
  color: var(--success);
}

.stat-delta.negative {
  color: var(--danger);
}

.stat-delta.neutral {
  color: var(--text-muted);
}

.stat-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-sparkline {
  position: absolute;
  right: 14px;
  bottom: 10px;
  width: 44%;
  height: 38px;
  pointer-events: none;
}

@media (max-width: 700px) {
  .stat-card {
    padding: 16px;
  }

  .stat-bottom {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .stat-sparkline {
    width: 38%;
  }
}
</style>
