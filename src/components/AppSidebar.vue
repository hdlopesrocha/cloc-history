<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import {
  ChevronDown,
  FolderGit2,
  LoaderCircle,
  Moon,
  Play,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-vue-next';
import { formatCompact, formatRelative } from '../utils/format.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  scans: { type: Array, default: () => [] },
  activeScanId: { type: String, default: '' },
  defaults: { type: Object, default: null },
  scanning: { type: Boolean, default: false },
  loadingScans: { type: Boolean, default: false },
  clocError: { type: String, default: '' },
  scanError: { type: String, default: '' },
  theme: { type: String, default: 'dark' },
});

const emit = defineEmits(['close', 'scan', 'load-scan', 'delete-scan', 'demo', 'toggle-theme']);

const STORAGE_KEY = 'cloc-history:scan-options';
const repoPath = ref('');
const revision = ref('HEAD');
const excludeText = ref('');
const firstParent = ref(false);
const maxCommits = ref(0);
const concurrency = ref(4);
const advancedOpen = ref(false);
const formError = ref('');
const repoInput = ref(null);
const initialized = ref(false);
const lastDefaults = ref(null);

function splitFolders(value) {
  return [...new Set(String(value ?? '').split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean))];
}

function readSavedOptions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

watch(
  () => props.defaults,
  (defaults) => {
    if (!defaults || initialized.value) return;
    initialized.value = true;
    lastDefaults.value = defaults;
    const saved = readSavedOptions();
    repoPath.value = saved?.repoPath || defaults.repoPath || '';
    revision.value = saved?.revision || defaults.revision || 'HEAD';
    excludeText.value = (saved?.excludeDirs?.length ? saved.excludeDirs : defaults.excludeDirs || [])
      .join('\n');
    firstParent.value = saved ? Boolean(saved.firstParent) : Boolean(defaults.firstParent);
    maxCommits.value = saved?.maxCommits ?? defaults.maxCommits ?? 0;
    concurrency.value = saved?.concurrency ?? defaults.concurrency ?? 4;
    advancedOpen.value = Boolean(saved?.advancedOpen);
  },
  { immediate: true },
);

const excludeCount = computed(() => splitFolders(excludeText.value).length);

const scanSummary = computed(() => {
  const history = firstParent.value ? 'first parent' : 'all commits';
  return `${history} · ${excludeCount.value} excluded`;
});

function submit() {
  formError.value = '';
  const repository = repoPath.value.trim();
  if (!repository) {
    formError.value = 'Enter a path to a local Git repository.';
    repoInput.value?.focus();
    return;
  }

  const limit = Number(maxCommits.value) || 0;
  if (!Number.isFinite(limit) || limit < 0) {
    formError.value = 'The commit limit must be zero or a positive number.';
    return;
  }

  const jobs = Number(concurrency.value) || 1;
  if (!Number.isFinite(jobs) || jobs < 1 || jobs > 16) {
    formError.value = 'Parallel jobs must be between 1 and 16.';
    return;
  }

  const payload = {
    repoPath: repository,
    revision: revision.value.trim() || 'HEAD',
    firstParent: firstParent.value,
    maxCommits: Math.floor(limit),
    concurrency: Math.floor(jobs),
    excludeDirs: splitFolders(excludeText.value),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, advancedOpen: advancedOpen.value }));
  } catch {
    // The scan can proceed without local persistence.
  }

  emit('scan', payload);
}

function resetOptions() {
  if (!lastDefaults.value) return;
  const defaults = lastDefaults.value;
  repoPath.value = defaults.repoPath || repoPath.value;
  revision.value = defaults.revision || 'HEAD';
  excludeText.value = (defaults.excludeDirs || []).join('\n');
  firstParent.value = Boolean(defaults.firstParent);
  maxCommits.value = defaults.maxCommits ?? 0;
  concurrency.value = defaults.concurrency ?? 4;
  formError.value = '';
}

function focusRepo() {
  advancedOpen.value = false;
  nextTick(() => repoInput.value?.focus());
}

defineExpose({ focusRepo });

function loadScan(scan) {
  if (props.scanning) return;
  emit('load-scan', scan);
  emit('close');
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-open': open }">
    <header class="sidebar-brand">
      <div class="brand-mark" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div class="brand-copy">
        <span class="brand-name">cloc<span>/</span>history</span>
        <span class="brand-tagline">Codebase archaeology</span>
      </div>
      <button class="icon-button mobile-close" type="button" aria-label="Close sidebar" @click="emit('close')">
        <X :size="17" />
      </button>
    </header>

    <div class="sidebar-body">
      <section class="scan-section">
        <div class="section-kicker">
          <span>New scan</span>
          <span class="engine-pill"><i /> git + cloc</span>
        </div>

        <div v-if="scanError" class="sidebar-alert error">{{ scanError }}</div>
        <div v-if="clocError" class="sidebar-alert warning">
          <span>{{ clocError }}</span>
        </div>

        <form class="scan-form" @submit.prevent="submit">
          <label class="field">
            <span class="field-label">Repository path</span>
            <div class="input-with-icon">
              <FolderGit2 :size="14" class="input-icon" />
              <input
                ref="repoInput"
                v-model="repoPath"
                class="field-input has-icon"
                type="text"
                placeholder="/home/you/project"
                spellcheck="false"
                autocomplete="off"
                :disabled="scanning"
              />
            </div>
          </label>

          <label class="field compact-field">
            <span class="field-label">Revision</span>
            <input
              v-model="revision"
              class="field-input mono"
              type="text"
              placeholder="HEAD"
              spellcheck="false"
              autocomplete="off"
              :disabled="scanning"
            />
          </label>

          <button
            class="advanced-toggle"
            type="button"
            :aria-expanded="advancedOpen"
            :disabled="scanning"
            @click="advancedOpen = !advancedOpen"
          >
            <ChevronDown :size="13" :class="{ rotated: advancedOpen }" />
            <span>Scan options</span>
            <span class="advanced-summary">{{ scanSummary }}</span>
          </button>

          <transition name="fold">
            <div v-if="advancedOpen" class="advanced-panel">
              <label class="field">
                <span class="field-label">Excluded folders <small>{{ excludeCount }}</small></span>
                <textarea
                  v-model="excludeText"
                  class="field-input folder-input"
                  rows="5"
                  spellcheck="false"
                  :disabled="scanning"
                  placeholder="node_modules&#10;dist&#10;third_party"
                />
                <span class="field-hint">Folder names at any depth. One per line or comma separated.</span>
              </label>

              <div class="option-grid">
                <label class="switch-row">
                  <span class="switch-copy">
                    <span>First-parent history</span>
                    <small>Follow merges as a single line.</small>
                  </span>
                  <span class="switch" :class="{ on: firstParent, disabled: scanning }">
                    <input v-model="firstParent" type="checkbox" :disabled="scanning" />
                    <i />
                  </span>
                </label>

                <label class="field">
                  <span class="field-label">Latest commits only <small>0 = all</small></span>
                  <input
                    v-model.number="maxCommits"
                    class="field-input mono"
                    type="number"
                    min="0"
                    step="1"
                    :disabled="scanning"
                  />
                </label>

                <label class="field">
                  <span class="field-label">Parallel cloc jobs <small>max 16</small></span>
                  <input
                    v-model.number="concurrency"
                    class="field-input mono"
                    type="number"
                    min="1"
                    max="16"
                    step="1"
                    :disabled="scanning"
                  />
                  <span class="field-hint">More jobs scan faster but use more CPU.</span>
                </label>
              </div>

              <button class="restore-button" type="button" :disabled="scanning" @click="resetOptions">
                Restore scan defaults
              </button>
            </div>
          </transition>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <button class="button primary scan-button" type="submit" :disabled="scanning">
            <LoaderCircle v-if="scanning" :size="16" class="spin" />
            <Play v-else :size="15" />
            {{ scanning ? 'Scan in progress…' : 'Count commits' }}
            <span class="button-shortcut">↵</span>
          </button>
        </form>
      </section>

      <section class="history-section">
        <div class="section-kicker">
          <span>Saved scans</span>
          <span class="history-count">{{ scans.length }}</span>
        </div>

        <div v-if="loadingScans" class="history-skeleton" aria-label="Loading saved scans">
          <span /><span /><span />
        </div>

        <div v-else-if="scans.length === 0" class="history-empty">
          <div class="empty-orbit"><span /></div>
          <p>Finished scans appear here, ready to reopen.</p>
        </div>

        <div v-else class="history-list">
          <div
            v-for="scan in scans"
            :key="scan.id"
            class="history-item"
            :class="{ active: activeScanId === scan.id, disabled: scanning }"
          >
            <button class="history-button" type="button" :disabled="scanning" @click="loadScan(scan)">
              <span class="history-active-dot" />
              <span class="history-main">
                <span class="history-top">
                  <span class="history-repo">{{ scan.repoName }}</span>
                  <span class="history-time">{{ formatRelative(scan.generatedAt) }}</span>
                </span>
                <span class="history-meta">
                  <span>{{ formatCompact(scan.code) }} LOC</span>
                  <span>{{ scan.commitCount }} commits</span>
                  <span>{{ scan.languageCount }} langs</span>
                </span>
              </span>
            </button>
            <button
              class="history-delete"
              type="button"
              title="Delete saved scan"
              aria-label="Delete saved scan"
              :disabled="scanning"
              @click.stop="emit('delete-scan', scan)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>

        <button class="demo-link" type="button" :disabled="scanning" @click="emit('demo')">
          <Sparkles :size="12" />
          Open demo workspace
        </button>
      </section>
    </div>

    <footer class="sidebar-footer">
      <div class="theme-switch" role="group" aria-label="Color theme">
        <button
          type="button"
          class="theme-option"
          :class="{ active: theme === 'dark' }"
          aria-label="Use dark theme"
          @click="emit('toggle-theme', 'dark')"
        >
          <Moon :size="12" /> Dark
        </button>
        <button
          type="button"
          class="theme-option"
          :class="{ active: theme === 'light' }"
          aria-label="Use light theme"
          @click="emit('toggle-theme', 'light')"
        >
          <Sun :size="12" /> Light
        </button>
      </div>
      <span class="footer-signature">local-first · no upload</span>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  position: fixed;
  z-index: 40;
  top: 0;
  bottom: 0;
  left: 0;
  width: 306px;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 2.5%, transparent), transparent 34%),
    var(--sidebar-bg);
  backdrop-filter: blur(18px);
}

.sidebar-brand {
  display: flex;
  flex: none;
  align-items: center;
  gap: 11px;
  padding: 21px 19px 19px;
  border-bottom: 1px solid var(--border-subtle);
}

.brand-mark {
  display: flex;
  width: 34px;
  height: 34px;
  flex: none;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  padding: 8px 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.brand-mark span {
  width: 3px;
  border-radius: 2px 2px 1px 1px;
  background: var(--accent);
  opacity: 0.85;
}

.brand-mark span:nth-child(1) { height: 6px; opacity: 0.45; }
.brand-mark span:nth-child(2) { height: 17px; }
.brand-mark span:nth-child(3) { height: 11px; opacity: 0.7; }
.brand-mark span:nth-child(4) { height: 8px; opacity: 0.35; }

.brand-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.brand-name {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 550;
  letter-spacing: -0.035em;
}

.brand-name span {
  margin: 0 1px;
  color: var(--accent);
}

.brand-tagline {
  color: var(--text-faint);
  font-size: 9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.mobile-close {
  display: none;
  margin-left: auto;
}

.sidebar-body {
  overflow-y: auto;
  flex: 1;
  padding: 19px 16px 16px;
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

.section-kicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-faint);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.engine-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 99px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.02em;
  text-transform: none;
}

.engine-pill i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--success);
}

.sidebar-alert {
  margin-bottom: 10px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 10.5px;
  line-height: 1.5;
}

.sidebar-alert.error {
  border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  color: var(--danger);
}

.sidebar-alert.warning {
  border-color: color-mix(in srgb, var(--warning) 24%, var(--border));
  background: color-mix(in srgb, var(--warning) 5%, transparent);
  color: var(--text-muted);
}

.scan-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 550;
}

.field-label small {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 400;
}

.field-input {
  width: 100%;
  min-width: 0;
  height: 35px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  background: var(--surface-sunken);
  color: var(--text);
  font: inherit;
  font-size: 11.5px;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.field-input:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.field-input:focus {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: var(--surface-raise);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 7%, transparent);
}

.field-input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.field-input::placeholder {
  color: var(--text-faint);
}

.field-input.mono {
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.input-with-icon {
  position: relative;
}

.input-icon {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 10px;
  color: var(--text-faint);
  pointer-events: none;
  transform: translateY(-50%);
}

.field-input.has-icon {
  padding-left: 30px;
}

.compact-field {
  display: grid;
  align-items: center;
  grid-template-columns: 75px 1fr;
}

.compact-field .field-input {
  height: 32px;
}

.advanced-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 6px 1px;
  border: 0;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  text-align: left;
}

.advanced-toggle:hover {
  color: var(--text-muted);
}

.advanced-toggle svg {
  transition: transform 170ms ease;
}

.advanced-toggle svg.rotated {
  transform: rotate(180deg);
}

.advanced-summary {
  overflow: hidden;
  margin-left: auto;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.advanced-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: -2px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  background: color-mix(in srgb, var(--surface-sunken) 55%, transparent);
}

.folder-input {
  height: 92px;
  padding: 8px 10px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 9.5px;
  line-height: 1.65;
}

.field-hint {
  color: var(--text-faint);
  font-size: 8.5px;
  line-height: 1.45;
}

.option-grid {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}

.switch-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switch-copy > span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 500;
}

.switch-copy small {
  color: var(--text-faint);
  font-size: 8.5px;
}

.switch {
  display: block;
  position: relative;
  width: 30px;
  height: 17px;
  flex: none;
}

.switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.switch i {
  position: absolute;
  inset: 0;
  border: 1px solid var(--border-strong);
  border-radius: 99px;
  background: var(--surface-sunken);
  transition: background 160ms ease, border-color 160ms ease;
}

.switch i::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--text-faint);
  content: '';
  transition: transform 160ms ease, background 160ms ease;
}

.switch.on i {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}

.switch.on i::after {
  background: var(--accent);
  transform: translateX(13px);
}

.switch.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.restore-button {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font: inherit;
  font-size: 9px;
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-underline-offset: 3px;
}

.restore-button:hover {
  color: var(--text-muted);
}

.form-error {
  margin: 0;
  color: var(--danger);
  font-size: 10px;
  line-height: 1.4;
}

.scan-button {
  width: 100%;
  justify-content: center;
  margin-top: 3px;
}

.button-shortcut {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.45;
}

.history-section {
  margin-top: 27px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.history-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.history-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 6px;
}

.history-empty p {
  max-width: 180px;
  margin: 0;
  color: var(--text-faint);
  font-size: 9.5px;
  line-height: 1.45;
}

.empty-orbit {
  display: grid;
  width: 29px;
  height: 29px;
  flex: none;
  place-items: center;
  border: 1px dashed var(--border-strong);
  border-radius: 50%;
}

.empty-orbit span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-faint);
}

.history-skeleton {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.history-skeleton span {
  height: 43px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: linear-gradient(90deg, var(--surface-sunken), var(--surface-raise), var(--surface-sunken));
  background-size: 180% 100%;
  animation: pulse 1.8s infinite;
}

.history-list {
  display: flex;
  max-height: 260px;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  margin: 0 -7px;
  padding: 0 7px 2px;
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

.history-item {
  display: flex;
  position: relative;
  flex: none;
  align-items: stretch;
  border: 1px solid transparent;
  border-radius: 8px;
  transition: background 150ms ease, border-color 150ms ease;
}

.history-item:hover {
  background: var(--surface-hover);
}

.history-item.active {
  border-color: color-mix(in srgb, var(--accent) 20%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}

.history-item.disabled {
  opacity: 0.5;
}

.history-button {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: stretch;
  gap: 8px;
  padding: 8px 28px 8px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.history-active-dot {
  width: 2px;
  flex: none;
  border-radius: 99px;
  background: transparent;
  transition: background 150ms ease;
}

.history-item.active .history-active-dot {
  background: var(--accent);
}

.history-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.history-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 9px;
}

.history-repo {
  overflow: hidden;
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  flex: none;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8px;
}

.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8px;
}

.history-meta span + span::before {
  margin-right: 5px;
  color: var(--border-strong);
  content: '·';
}

.history-delete {
  position: absolute;
  top: 50%;
  right: 5px;
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 150ms ease, color 150ms ease, background 150ms ease;
}

.history-item:hover .history-delete {
  opacity: 1;
}

.history-delete:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.demo-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  padding: 5px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font: inherit;
  font-size: 9.5px;
}

.demo-link:hover {
  background: var(--surface-hover);
  color: var(--text-muted);
}

.sidebar-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 16px;
  border-top: 1px solid var(--border-subtle);
}

.theme-switch {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--surface-sunken);
}

.theme-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font: inherit;
  font-size: 8.5px;
  transition: background 150ms ease, color 150ms ease;
}

.theme-option.active {
  background: var(--surface-raise);
  color: var(--text-soft);
  box-shadow: var(--shadow-xs);
}

.footer-signature {
  color: var(--text-faint);
  font-size: 8px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.fold-enter-active,
.fold-leave-active {
  overflow: hidden;
  transition: opacity 170ms ease, transform 170ms ease;
}

.fold-enter-from,
.fold-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 1050px) {
  .sidebar {
    width: min(340px, 90vw);
    box-shadow: 30px 0 80px rgba(0, 0, 0, 0.3);
    transform: translateX(-102%);
    transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .sidebar.is-open {
    transform: translateX(0);
  }

  .mobile-close {
    display: inline-flex;
  }
}

@media (max-height: 720px) {
  .sidebar-brand {
    padding-top: 15px;
    padding-bottom: 14px;
  }

  .sidebar-body {
    padding-top: 14px;
  }

  .history-section {
    margin-top: 20px;
    padding-top: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .history-skeleton span {
    animation: none;
  }

  .sidebar {
    transition: none;
  }
}
</style>
