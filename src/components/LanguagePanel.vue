<script setup>
import { computed, ref } from 'vue';
import { Check, Pipette, RotateCcw, Search } from 'lucide-vue-next';
import { formatNumber, formatPercent } from '../utils/format.js';

const props = defineProps({
  languages: { type: Array, required: true },
  selected: { type: Array, required: true },
  metric: { type: String, default: 'code' },
  total: { type: Number, default: 0 },
});

const emit = defineEmits(['toggle', 'set-color', 'select-all', 'select-none', 'reset-colors']);

const search = ref('');

const filteredLanguages = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return props.languages;
  return props.languages.filter((language) => language.name.toLowerCase().includes(query));
});

const selectedSet = computed(() => new Set(props.selected));

const allShare = computed(() => props.languages.reduce((sum, language) => sum + language.share, 0) || 1);

const visibleSegments = computed(() => props.languages.filter((language) => language.share > 0));

const selectedCount = computed(() => props.languages.filter((language) => selectedSet.value.has(language.name)).length);

function isSelected(name) {
  return selectedSet.value.has(name);
}

function metricWord() {
  return props.metric === 'code' ? 'lines' : props.metric === 'comment' ? 'comments' : props.metric === 'blank' ? 'blanks' : 'lines';
}
</script>

<template>
  <section class="panel language-panel">
    <header class="panel-heading">
      <div>
        <div class="eyebrow">Composition</div>
        <h2>Language mix</h2>
      </div>
      <div class="heading-actions">
        <button class="text-button" type="button" @click="emit('select-all')">All</button>
        <button class="text-button" type="button" @click="emit('select-none')">None</button>
        <button class="icon-button subtle" type="button" title="Reset language colors" aria-label="Reset language colors" @click="emit('reset-colors')">
          <RotateCcw :size="14" />
        </button>
      </div>
    </header>

    <div class="composition-summary">
      <span><strong>{{ selectedCount }}</strong> of {{ languages.length }} selected</span>
      <span>{{ formatNumber(total) }} {{ metricWord() }} at HEAD</span>
    </div>

    <div class="composition-bar" aria-hidden="true">
      <span
        v-for="language in visibleSegments"
        :key="language.name"
        class="composition-segment"
        :style="{ width: `${(language.share / allShare) * 100}%`, background: language.color }"
        :title="`${language.name}: ${formatPercent(language.share)}`"
      />
    </div>

    <label class="language-search">
      <Search :size="14" />
      <input v-model="search" type="search" placeholder="Find a language" aria-label="Find a language" />
    </label>

    <div class="language-list">
      <div
        v-for="language in filteredLanguages"
        :key="language.name"
        class="language-row"
        :class="{ 'is-muted': !isSelected(language.name) }"
      >
        <button
          class="language-main"
          type="button"
          :aria-pressed="isSelected(language.name)"
          :title="isSelected(language.name) ? `Hide ${language.name} from the chart` : `Show ${language.name} in the chart`"
          @click="emit('toggle', language.name)"
        >
          <span class="language-swatch" :style="{ '--lang-color': language.color }">
            <Check v-if="isSelected(language.name)" :size="10" :stroke-width="3" />
          </span>
          <span class="language-copy">
            <span class="language-name">{{ language.name }}</span>
            <span class="language-track">
              <span class="language-fill" :style="{ width: `${Math.min(100, language.share)}%`, background: language.color }" />
            </span>
          </span>
          <span class="language-values">
            <strong>{{ formatNumber(language.value) }}</strong>
            <small>{{ formatPercent(language.share) }}</small>
          </span>
        </button>

        <label class="color-control" title="Choose a custom color">
          <input
            type="color"
            :value="language.color"
            :aria-label="`Change the color for ${language.name}`"
            @input="emit('set-color', { name: language.name, color: $event.target.value })"
          />
          <Pipette :size="12" />
        </label>
      </div>

      <div v-if="!filteredLanguages.length" class="language-empty">
        No language matches “{{ search }}”.
      </div>
    </div>

    <footer class="panel-footer">
      <span>Click a row to include or hide a language.</span>
      <span class="footer-hint">Color swatch is editable.</span>
    </footer>
  </section>
</template>

<style scoped>
.language-panel {
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

.heading-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}

.text-button {
  padding: 4px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  transition: color 160ms ease, background 160ms ease;
}

.text-button:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.composition-summary {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
  color: var(--text-faint);
  font-size: 11px;
}

.composition-summary strong {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-weight: 500;
}

.composition-bar {
  display: flex;
  height: 7px;
  overflow: hidden;
  gap: 2px;
  margin-top: 9px;
  border-radius: 99px;
  background: var(--surface-sunken);
}

.composition-segment {
  min-width: 2px;
  height: 100%;
  opacity: 0.88;
  transition: width 220ms ease, opacity 160ms ease;
}

.composition-segment:hover {
  opacity: 1;
}

.composition-segment + .composition-segment {
  box-shadow: -2px 0 0 var(--panel-solid);
}

.language-search {
  display: flex;
  height: 33px;
  align-items: center;
  gap: 7px;
  margin-top: 16px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-sunken);
  color: var(--text-faint);
  transition: border-color 160ms ease;
}

.language-search:focus-within {
  border-color: var(--border-accent);
}

.language-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 11.5px;
}

.language-search input::placeholder {
  color: var(--text-faint);
}

.language-list {
  overflow-y: auto;
  flex: 1;
  max-height: 420px;
  margin: 8px -8px 0;
  padding: 0 8px 2px;
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

.language-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  transition: background 150ms ease;
}

.language-row:hover {
  background: var(--surface-hover);
}

.language-row.is-muted .language-copy,
.language-row.is-muted .language-values {
  opacity: 0.48;
}

.language-main {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 5px 3px 5px 6px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.language-swatch {
  display: inline-flex;
  width: 17px;
  height: 17px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--lang-color) 65%, var(--border-strong));
  border-radius: 5px;
  background: color-mix(in srgb, var(--lang-color) 16%, transparent);
  color: var(--lang-color);
  transition: background 160ms ease, transform 160ms ease;
}

.language-row.is-muted .language-swatch {
  border-color: var(--border);
  background: transparent;
}

.language-main:hover .language-swatch {
  transform: scale(1.06);
}

.language-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.language-name {
  overflow: hidden;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.language-track {
  display: block;
  overflow: hidden;
  width: 100%;
  height: 2px;
  border-radius: 99px;
  background: var(--surface-sunken);
}

.language-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  opacity: 0.65;
}

.language-values {
  display: flex;
  min-width: 65px;
  align-items: flex-end;
  flex-direction: column;
  gap: 2px;
  font-variant-numeric: tabular-nums;
}

.language-values strong {
  color: var(--text-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
}

.language-values small {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.color-control {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-faint);
  cursor: pointer;
  opacity: 0;
  transition: opacity 150ms ease, background 150ms ease, color 150ms ease;
}

.language-row:hover .color-control,
.color-control:focus-within {
  opacity: 1;
}

.color-control:hover {
  background: var(--surface-sunken);
  color: var(--text-soft);
}

.color-control input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.language-empty {
  padding: 30px 16px;
  color: var(--text-faint);
  font-size: 12px;
  text-align: center;
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 11px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-faint);
  font-size: 10px;
}

.footer-hint {
  text-align: right;
}

@media (max-width: 700px) {
  .language-panel {
    min-height: 0;
  }

  .language-main {
    padding: 6px 3px 6px 6px;
  }

  .language-list {
    max-height: 480px;
  }

  .panel-footer {
    flex-direction: column;
    gap: 3px;
  }

  .footer-hint {
    text-align: left;
  }

  .color-control {
    opacity: 1;
  }
}
</style>
