<script setup>
import { computed } from 'vue';
import { formatCompact, formatDate, formatRelative } from '../utils/format.js';

const props = defineProps({
  commits: { type: Array, required: true },
  metric: { type: String, default: 'code' },
  colors: { type: Object, default: () => ({}) },
});

function totalFor(commit) {
  if (!commit) return 0;
  if (props.metric === 'lines') return commit.totals.code + commit.totals.comment + commit.totals.blank;
  return commit.totals[props.metric] ?? 0;
}

function languageTotal(language, metric) {
  if (!language) return 0;
  if (metric === 'lines') return language.code + language.comment + language.blank;
  return language[metric] ?? 0;
}

function biggestMover(commit, previous) {
  if (!previous) return null;
  const previousMap = new Map(previous.languages.map((language) => [language.name, language]));

  let winner = null;
  for (const language of commit.languages) {
    const before = languageTotal(previousMap.get(language.name), props.metric);
    const after = languageTotal(language, props.metric);
    const difference = after - before;
    if (!winner || Math.abs(difference) > Math.abs(winner.difference)) {
      winner = { name: language.name, difference };
    }
  }

  for (const language of previous.languages) {
    if (commit.languages.some((entry) => entry.name === language.name)) continue;
    const difference = -languageTotal(language, props.metric);
    if (!winner || Math.abs(difference) > Math.abs(winner.difference)) {
      winner = { name: language.name, difference };
    }
  }

  if (!winner || winner.difference === 0) return null;
  return { ...winner, color: props.colors[winner.name] || 'var(--text-faint)' };
}

const rows = computed(() => {
  const count = Math.min(9, props.commits.length);
  return props.commits
    .slice(props.commits.length - count)
    .map((commit, index) => {
      const absoluteIndex = props.commits.length - count + index;
      const previous = props.commits[absoluteIndex - 1];
      return {
        commit,
        value: totalFor(commit),
        mover: biggestMover(commit, previous),
        added: commit.changes?.added,
        deleted: commit.changes?.deleted,
      };
    })
    .reverse();
});
</script>

<template>
  <section class="panel commit-panel">
    <header class="panel-heading">
      <div>
        <div class="eyebrow">Latest activity</div>
        <h2>Recent commits</h2>
      </div>
      <span class="commit-count">{{ rows.length }} latest</span>
    </header>

    <div class="commit-list">
      <article v-for="(row, index) in rows" :key="row.commit.sha" class="commit-row">
        <div class="commit-rail">
          <span
            class="commit-dot"
            :style="{ '--dot-color': row.mover?.color || 'var(--text-faint)' }"
          />
          <span v-if="index < rows.length - 1" class="commit-line" />
        </div>

        <div class="commit-copy">
          <div class="commit-subject" :title="row.commit.subject">{{ row.commit.subject }}</div>
          <div class="commit-meta">
            <code>{{ row.commit.shortSha }}</code>
            <span class="meta-divider">/</span>
            <span>{{ row.commit.author }}</span>
            <span class="meta-divider">·</span>
            <span :title="formatDate(row.commit.date)">{{ formatRelative(row.commit.date) }}</span>
          </div>
        </div>

        <div class="commit-numbers">
          <span class="commit-value">{{ formatCompact(row.value) }}</span>
          <span v-if="row.added !== undefined || row.deleted !== undefined" class="commit-churn">
            <span class="churn-added">+{{ formatCompact(row.added ?? 0) }}</span>
            <span class="churn-deleted">−{{ formatCompact(row.deleted ?? 0) }}</span>
          </span>
          <span v-else class="commit-churn muted">no Git churn data</span>
        </div>

        <div v-if="row.mover" class="commit-mover" :title="`Largest change: ${row.mover.name}`">
          <span class="mover-dot" :style="{ background: row.mover.color }" />
          <span class="mover-name">{{ row.mover.name }}</span>
        </div>
      </article>
    </div>

    <footer class="panel-footer">
      <span>Size is measured at each commit; +/- are Git line changes.</span>
      <span v-if="commits.length > 9">+{{ commits.length - 9 }} more in the full CSV</span>
    </footer>
  </section>
</template>

<style scoped>
.commit-panel {
  display: flex;
  min-height: 460px;
  flex-direction: column;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.commit-count {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 99px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
  white-space: nowrap;
}

.commit-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  margin: 14px -10px 0;
  padding: 0 10px;
}

.commit-row {
  display: grid;
  position: relative;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  gap: 9px;
  padding: 9px 5px;
  border-radius: 8px;
  transition: background 150ms ease;
}

.commit-row:hover {
  background: var(--surface-hover);
}

.commit-rail {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding-top: 5px;
}

.commit-dot {
  display: block;
  width: 7px;
  height: 7px;
  flex: none;
  border: 1.5px solid color-mix(in srgb, var(--dot-color) 80%, var(--text));
  border-radius: 50%;
  background: color-mix(in srgb, var(--dot-color) 20%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dot-color) 7%, transparent);
}

.commit-line {
  width: 1px;
  flex: 1;
  margin-top: 5px;
  background: var(--border-subtle);
}

.commit-copy {
  min-width: 0;
}

.commit-subject {
  overflow: hidden;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commit-meta {
  display: flex;
  overflow: hidden;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  color: var(--text-faint);
  font-size: 10px;
  white-space: nowrap;
}

.commit-meta code {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.meta-divider {
  opacity: 0.55;
}

.commit-numbers {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 3px;
  padding-top: 1px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.commit-value {
  color: var(--text-soft);
  font-size: 10.5px;
  font-weight: 500;
}

.commit-churn {
  display: inline-flex;
  gap: 5px;
  font-size: 9px;
  font-weight: 600;
  white-space: nowrap;
}

.commit-churn.muted {
  color: var(--text-faint);
  font-weight: 400;
}

.churn-added {
  color: var(--success);
}

.churn-deleted {
  color: var(--danger);
}

.commit-mover {
  display: none;
  grid-column: 2 / -1;
  min-width: 0;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  color: var(--text-faint);
  font-size: 9.5px;
}

.mover-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
}

.mover-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-faint);
  font-size: 10px;
}

@media (min-width: 1360px) {
  .commit-mover {
    display: flex;
  }

  .commit-row {
    row-gap: 2px;
  }
}

@media (max-width: 700px) {
  .commit-panel {
    min-height: 0;
  }

  .panel-footer {
    flex-direction: column;
    gap: 3px;
  }
}
</style>
