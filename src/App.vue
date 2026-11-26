<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  CalendarRange,
  ChartArea,
  ChartColumn,
  ChartLine,
  ChartNoAxesCombined,
  CheckCircle2,
  Database,
  Download,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  ImageDown,
  Info,
  Layers3,
  LoaderCircle,
  Menu,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-vue-next';
import AppSidebar from './components/AppSidebar.vue';
import CommitFeed from './components/CommitFeed.vue';
import EmptyState from './components/EmptyState.vue';
import HistoryChart from './components/HistoryChart.vue';
import LanguagePanel from './components/LanguagePanel.vue';
import ScanProgress from './components/ScanProgress.vue';
import StatCard from './components/StatCard.vue';
import { chooseColor } from './utils/colors.js';
import { downloadDataUrl, downloadScanCsv } from './utils/export.js';
import {
  METRICS,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  formatShortDate,
  metricLabel,
  rangeLabel,
  sanitizeFilename,
  spanLabel,
} from './utils/format.js';

const THEME_KEY = 'cloc-history:theme';
const METRIC_KEY = 'cloc-history:metric';
const CHART_TYPE_KEY = 'cloc-history:chart-type';
const COLORS_KEY = 'cloc-history:colors';
const LAST_SCAN_KEY = 'cloc-history:last-scan';

const CHART_TYPES = [
  { id: 'area', label: 'Stacked area', icon: ChartArea },
  { id: 'line', label: 'Stacked lines', icon: ChartLine },
  { id: 'bar', label: 'Stacked bars', icon: ChartColumn },
];

function readStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is a convenience, not a requirement.
  }
}

function initialTheme() {
  const stored = readStorage(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initialMetric() {
  const stored = readStorage(METRIC_KEY);
  return METRICS.some((metric) => metric.id === stored) ? stored : 'code';
}

function initialChartType() {
  const stored = readStorage(CHART_TYPE_KEY);
  return CHART_TYPES.some((type) => type.id === stored) ? stored : 'area';
}

const theme = ref(initialTheme());
const metric = ref(initialMetric());
const chartType = ref(initialChartType());
const colorStore = ref(readStorage(COLORS_KEY, {}) || {});

const appConfig = ref(null);
const savedScans = ref([]);
const bootLoading = ref(true);
const loadingScans = ref(true);
const loadingScan = ref(false);
const currentScan = ref(null);
const activeSavedId = ref('');
const activeJob = ref(null);
const jobCancelling = ref(false);
const scanError = ref('');
const sidebarOpen = ref(false);
const sidebarRef = ref(null);
const chartRef = ref(null);

const selectedNames = ref([]);
const toasts = ref([]);
const toastTimers = new Map();
let toastCounter = 0;
let pollTimer = null;
let pollFailures = 0;
let disposed = false;

const currentToolbarEngine = computed(() => {
  if (currentScan.value?.demo) return 'demo dataset';
  if (currentScan.value?.engine?.version) return `cloc ${currentScan.value.engine.version}`;
  if (appConfig.value?.cloc) return `cloc ${appConfig.value.cloc}`;
  return appConfig.value?.clocError ? 'cloc unavailable' : 'cloc';
});

const engineNote = computed(() => {
  if (currentScan.value?.demo) return 'Seeded demo dataset';
  if (appConfig.value?.cloc) return `cloc ${appConfig.value.cloc}`;
  return 'cloc';
});

const topbarRepo = computed(() => {
  if (activeJob.value) {
    const repository = activeJob.value.options?.repoPath || '';
    return repository.split('/').filter(Boolean).at(-1) || 'repository';
  }
  return currentScan.value?.repoName || 'Workspace';
});

const topbarBranch = computed(() => {
  if (activeJob.value) return '';
  return currentScan.value?.branch || '';
});

const commits = computed(() => currentScan.value?.commits ?? []);
const latestCommit = computed(() => commits.value.at(-1) ?? null);
const firstCommit = computed(() => commits.value[0] ?? null);
const commitCount = computed(() => commits.value.length);
const firstDate = computed(() => currentScan.value?.summary?.firstDate || firstCommit.value?.date || null);
const lastDate = computed(() => currentScan.value?.summary?.lastDate || latestCommit.value?.date || null);
const metricInfo = computed(() => metricLabel(metric.value));

function commitTotal(commit, chosenMetric = metric.value) {
  if (!commit) return 0;
  if (chosenMetric === 'lines') return commit.totals.lines ?? (commit.totals.code + commit.totals.comment + commit.totals.blank);
  return commit.totals[chosenMetric] ?? 0;
}

function languageMetric(language, chosenMetric = metric.value) {
  if (!language) return 0;
  if (chosenMetric === 'lines') return language.code + language.comment + language.blank;
  return language[chosenMetric] ?? 0;
}

const currentTotal = computed(() => commitTotal(latestCommit.value));
const baselineTotal = computed(() => (commits.value.length > 1 ? commitTotal(firstCommit.value) : 0));
const netGrowth = computed(() => currentTotal.value - baselineTotal.value);
const growthPercent = computed(() => (baselineTotal.value > 0 ? (netGrowth.value / baselineTotal.value) * 100 : null));
const growthDeltaLabel = computed(() => {
  if (growthPercent.value === null || !Number.isFinite(growthPercent.value)) return '';
  if (Math.abs(growthPercent.value) >= 10000) return '';
  return formatPercent(growthPercent.value);
});
const growthDetailLabel = computed(() => {
  if (growthPercent.value !== null && Math.abs(growthPercent.value) >= 10000) {
    const unit = metric.value === 'comment'
      ? 'comment lines'
      : metric.value === 'blank'
        ? 'blank lines'
        : metric.value === 'lines'
          ? 'total lines'
          : 'lines';
    return `from ${formatNumber(baselineTotal.value)} ${unit} on ${formatShortDate(firstDate.value)}`;
  }
  return `since ${formatShortDate(firstDate.value)}`;
});
const netGrowthDeltaTone = computed(() => (netGrowth.value > 0 ? 'positive' : netGrowth.value < 0 ? 'negative' : 'neutral'));
const netGrowthLabel = computed(() => {
  const sign = netGrowth.value > 0 ? '+' : netGrowth.value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(netGrowth.value))}`;
});

const peak = computed(() => {
  let best = { value: -1, date: null, commit: null };
  for (const commit of commits.value) {
    const value = commitTotal(commit);
    if (value > best.value) best = { value, date: commit.date, commit };
  }
  return best.value < 0 ? { value: 0, date: null, commit: null } : best;
});

const trendValues = computed(() => commits.value.map((commit) => commitTotal(commit)));
const activeLanguageCount = computed(() => latestCommit.value?.languages.filter((language) => language.code > 0).length ?? 0);
const historicalLanguageCount = computed(() => currentScan.value?.languages.length ?? 0);
const filesAtHead = computed(() => latestCommit.value?.totals.files ?? 0);
const timeSpan = computed(() => spanLabel(firstDate.value, lastDate.value));

const languageRows = computed(() => {
  if (!currentScan.value) return [];
  const latest = latestCommit.value;
  const latestByName = new Map((latest?.languages ?? []).map((language) => [language.name, language]));
  const rows = currentScan.value.languages.map((language) => {
    const latestLanguage = latestByName.get(language.name);
    return {
      name: language.name,
      color: colorStore.value[language.name] || chooseColor(language.name, new Set(Object.values(colorStore.value))),
      value: languageMetric(latestLanguage),
      files: latestLanguage?.files ?? 0,
      share: 0,
    };
  });

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  for (const row of rows) row.share = total > 0 ? (row.value / total) * 100 : 0;
  return rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
});

const languageColors = computed(() => Object.fromEntries(languageRows.value.map((language) => [language.name, language.color])));
const selectedSet = computed(() => new Set(selectedNames.value));
const selectedSeries = computed(() => languageRows.value.filter((language) => selectedSet.value.has(language.name)));
const allMetricTotal = computed(() => languageRows.value.reduce((sum, language) => sum + language.value, 0));
const visibleMetricTotal = computed(() => selectedSeries.value.reduce((sum, language) => sum + language.value, 0));

const metricOptions = METRICS;
const chartTypeOptions = CHART_TYPES;

const scanMetaRange = computed(() => rangeLabel(firstDate.value, lastDate.value));
const scanMetaCommits = computed(() => `${formatNumber(commitCount.value)} commits`);
const excludedCount = computed(() => currentScan.value?.options?.excludeDirs?.length ?? 0);
const historyMode = computed(() => (currentScan.value?.options?.firstParent ? 'first-parent history' : 'all commits'));

const isDemo = computed(() => Boolean(currentScan.value?.demo));
const shouldShowDashboard = computed(() => Boolean(currentScan.value) && !activeJob.value && !bootLoading.value);

const sidebarDefaults = computed(() => appConfig.value?.defaults ?? null);
const sidebarScanning = computed(() => Boolean(activeJob.value));

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value;
    writeStorage(THEME_KEY, value);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', value === 'light' ? '#f4f1e8' : '#08100d');
  },
  { immediate: true },
);

watch(metric, (value) => writeStorage(METRIC_KEY, value));
watch(chartType, (value) => writeStorage(CHART_TYPE_KEY, value));

watch(sidebarOpen, (isOpen) => {
  document.documentElement.style.overflow = isOpen ? 'hidden' : '';
});

watch(
  () => currentScan.value?.repoName,
  (name) => {
    document.title = name ? `${name} · cloc/history` : 'cloc/history · codebase archaeology';
  },
  { immediate: true },
);

function api(path, options = {}) {
  const request = { ...options, headers: { ...(options.headers || {}) } };
  if (request.body && !request.headers['Content-Type']) {
    request.headers['Content-Type'] = 'application/json';
  }
  return fetch(path, request).then(async (response) => {
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }
    return data;
  });
}

function dismissToast(id) {
  const timer = toastTimers.get(id);
  if (timer) clearTimeout(timer);
  toastTimers.delete(id);
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

function pushToast(type, title, message = '') {
  const id = ++toastCounter;
  toasts.value.push({ id, type, title, message });
  toastTimers.set(id, window.setTimeout(() => dismissToast(id), 5000));
}

function toastType(type) {
  return type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'info' ? 'info' : 'success';
}

async function loadSavedScan(scanOrId) {
  if (!scanOrId || activeJob.value || loadingScan.value) return;
  const id = typeof scanOrId === 'string' ? scanOrId : scanOrId.id;
  if (!id) return;

  loadingScan.value = true;
  scanError.value = '';
  try {
    const { scan } = await api(`/api/scans/${encodeURIComponent(id)}`);
    applyScan(scan, { resetFilters: true });
    sidebarOpen.value = false;
    writeStorage(LAST_SCAN_KEY, scan.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    pushToast('error', 'Could not open that scan', error.message);
  } finally {
    loadingScan.value = false;
  }
}

async function refreshSavedScans({ silent = false } = {}) {
  try {
    const { scans } = await api('/api/scans');
    savedScans.value = scans;
  } catch (error) {
    if (!silent) pushToast('error', 'Could not list saved scans', error.message);
  } finally {
    loadingScans.value = false;
  }
}

function ensureColors(scan) {
  const next = { ...colorStore.value };
  const used = new Set(Object.values(next));
  let changed = false;

  const orderedNames = scan.languages.map((language) => language.name);
  for (const name of orderedNames) {
    if (next[name]) continue;
    const color = chooseColor(name, used);
    next[name] = color;
    used.add(color);
    changed = true;
  }

  if (changed) {
    colorStore.value = next;
    writeStorage(COLORS_KEY, next);
  }
}

function defaultLanguageSelection(scan) {
  const latest = scan.commits.at(-1);
  const latestByName = new Map((latest?.languages ?? []).map((language) => [language.name, language]));
  const ranked = scan.languages
    .filter((language) => (latestByName.get(language.name)?.code ?? 0) > 0)
    .map((language) => ({
      name: language.name,
      value: languageMetric(latestByName.get(language.name), metric.value),
    }))
    .sort((a, b) => b.value - a.value)
    .map((language) => language.name);

  if (!ranked.length) return scan.languages.slice(0, 16).map((language) => language.name);
  return ranked.slice(0, 16);
}

function applyScan(scan, { resetFilters = true } = {}) {
  if (!scan) return;
  const isNewScan = currentScan.value?.id !== scan.id || currentScan.value?.generatedAt !== scan.generatedAt;
  ensureColors(scan);
  currentScan.value = scan;
  activeSavedId.value = scan.demo ? 'demo' : scan.id;
  scanError.value = '';
  if (resetFilters || isNewScan) {
    selectedNames.value = defaultLanguageSelection(scan);
  } else {
    const available = new Set(scan.languages.map((language) => language.name));
    selectedNames.value = selectedNames.value.filter((name) => available.has(name));
    if (!selectedNames.value.length) selectedNames.value = defaultLanguageSelection(scan);
  }
}

async function bootstrap() {
  bootLoading.value = true;
  loadingScans.value = true;

  const [configResult, scansResult] = await Promise.allSettled([
    api('/api/config'),
    api('/api/scans'),
  ]);

  if (configResult.status === 'fulfilled') {
    appConfig.value = configResult.value;
  } else {
    pushToast('error', 'Backend configuration unavailable', configResult.reason?.message || 'The API did not respond.');
  }

  if (scansResult.status === 'fulfilled') {
    savedScans.value = scansResult.value.scans;
  } else {
    pushToast('error', 'Could not load saved scans', scansResult.reason?.message || 'The API did not respond.');
  }
  loadingScans.value = false;

  if (savedScans.value.length) {
    const preferredId = readStorage(LAST_SCAN_KEY);
    const candidate = savedScans.value.find((scan) => scan.id === preferredId) || savedScans.value[0];
    await loadSavedScan(candidate.id);
  }

  bootLoading.value = false;
}

async function loadDemo() {
  if (activeJob.value || loadingScan.value) return;
  loadingScan.value = true;
  scanError.value = '';
  try {
    const { scan } = await api('/api/demo');
    applyScan(scan, { resetFilters: true });
    activeSavedId.value = 'demo';
    sidebarOpen.value = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    pushToast('info', 'Demo workspace loaded', 'This is generated sample data, not a real repository scan.');
  } catch (error) {
    pushToast('error', 'Could not load the demo', error.message);
  } finally {
    loadingScan.value = false;
  }
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function pollJob(id) {
  try {
    const { job } = await api(`/api/scan/${encodeURIComponent(id)}`);
    if (disposed) return;
    activeJob.value = job;
    pollFailures = 0;

    if (job.status === 'running') {
      pollTimer = window.setTimeout(() => pollJob(id), 650);
      return;
    }

    activeJob.value = null;
    jobCancelling.value = false;

    if (job.status === 'done' && job.result) {
      applyScan(job.result, { resetFilters: true });
      writeStorage(LAST_SCAN_KEY, job.result.id);
      scanError.value = '';
      await refreshSavedScans({ silent: true });
      pushToast(
        'success',
        'Scan complete',
        `${formatNumber(job.result.summary.commitCount)} commits counted in ${formatDuration(job.result.durationMs)}.`,
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (job.status === 'cancelled') {
      scanError.value = '';
      pushToast('info', 'Scan cancelled', 'No changes were made to your saved scans.');
      return;
    }

    scanError.value = job.error || 'The scan failed.';
    pushToast('error', 'Scan failed', scanError.value);
  } catch (error) {
    if (disposed) return;
    pollFailures += 1;
    if (pollFailures <= 4) {
      pollTimer = window.setTimeout(() => pollJob(id), 1600);
      return;
    }
    activeJob.value = null;
    jobCancelling.value = false;
    scanError.value = error.message;
    pushToast('error', 'Lost contact with the scan', error.message);
  }
}

async function startScan(payload) {
  if (activeJob.value || loadingScan.value) return;
  scanError.value = '';
  jobCancelling.value = false;

  try {
    const { job } = await api('/api/scan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    activeJob.value = job;
    pollFailures = 0;
    sidebarOpen.value = false;
    writeStorage('cloc-history:scan-options', { ...payload, advancedOpen: false });
    pollTimer = window.setTimeout(() => pollJob(job.id), 450);
  } catch (error) {
    scanError.value = error.message;
    pushToast('error', 'Could not start the scan', error.message);
  }
}

async function cancelScan() {
  if (!activeJob.value || jobCancelling.value) return;
  jobCancelling.value = true;
  try {
    await api(`/api/scan/${encodeURIComponent(activeJob.value.id)}/cancel`, { method: 'POST' });
  } catch (error) {
    jobCancelling.value = false;
    pushToast('error', 'Could not cancel the scan', error.message);
  }
}

function rescanCurrent() {
  if (!currentScan.value || currentScan.value.demo) {
    openScanPanel();
    return;
  }
  startScan({
    repoPath: currentScan.value.repoPath,
    revision: currentScan.value.revision || 'HEAD',
    excludeDirs: currentScan.value.options?.excludeDirs || [],
    firstParent: Boolean(currentScan.value.options?.firstParent),
    maxCommits: currentScan.value.options?.maxCommits || 0,
    concurrency: currentScan.value.options?.concurrency || appConfig.value?.defaults?.concurrency || 4,
  });
}

function openScanPanel() {
  if (activeJob.value) return;
  if (window.innerWidth <= 1050) sidebarOpen.value = true;
  nextTick(() => sidebarRef.value?.focusRepo?.());
}

function closeSidebar() {
  sidebarOpen.value = false;
}

async function deleteSavedScan(scan) {
  if (!scan || activeJob.value) return;
  const confirmed = window.confirm(`Delete the saved scan for “${scan.repoName}”?\n\nThis only removes the local snapshot.`);
  if (!confirmed) return;

  try {
    await api(`/api/scans/${encodeURIComponent(scan.id)}`, { method: 'DELETE' });
    const wasActive = activeSavedId.value === scan.id;
    await refreshSavedScans({ silent: true });
    pushToast('success', 'Saved scan deleted', `${scan.repoName} is no longer in your history.`);

    if (wasActive) {
      currentScan.value = null;
      activeSavedId.value = '';
      if (savedScans.value.length) {
        await loadSavedScan(savedScans.value[0]);
      }
    }
  } catch (error) {
    pushToast('error', 'Could not delete the scan', error.message);
  }
}

function toggleLanguage(name) {
  if (selectedSet.value.has(name)) {
    selectedNames.value = selectedNames.value.filter((entry) => entry !== name);
  } else {
    selectedNames.value = [...selectedNames.value, name];
  }
}

function selectAllLanguages() {
  selectedNames.value = languageRows.value.map((language) => language.name);
}

function selectNoLanguages() {
  selectedNames.value = [];
}

function setLanguageColor({ name, color }) {
  if (!name || !color) return;
  colorStore.value = { ...colorStore.value, [name]: color };
  writeStorage(COLORS_KEY, colorStore.value);
}

function resetLanguageColors() {
  if (!currentScan.value) return;
  const next = { ...colorStore.value };
  for (const language of currentScan.value.languages) delete next[language.name];

  const used = new Set(Object.values(next));
  for (const language of currentScan.value.languages) {
    const color = chooseColor(language.name, used);
    next[language.name] = color;
    used.add(color);
  }

  colorStore.value = next;
  writeStorage(COLORS_KEY, next);
  pushToast('info', 'Language colors restored', 'Custom colors for this scan were reset.');
}

function exportCsv() {
  if (!currentScan.value) return;
  downloadScanCsv(currentScan.value);
  pushToast('success', 'CSV exported', `${formatNumber(commitCount.value)} commits with every language breakdown.`);
}

async function exportChart() {
  if (!currentScan.value || !chartRef.value || !selectedSeries.value.length) return;
  try {
    const css = getComputedStyle(document.documentElement);
    const background = css.getPropertyValue('--panel-solid').trim() || (theme.value === 'dark' ? '#0c1713' : '#fbf8ef');
    const dataUrl = await chartRef.value.downloadPng({
      backgroundColor: background,
      title: `${currentScan.value.repoName} · ${metricInfo.value.longLabel.toLowerCase()}`,
      subtitle: `${formatDateTime(lastDate.value)} · ${selectedSeries.value.length} language${selectedSeries.value.length === 1 ? '' : 's'} · cloc-history`,
      theme: theme.value,
    });
    if (!dataUrl) throw new Error('The chart is not ready yet.');
    const fileName = `${sanitizeFilename(currentScan.value.repoName)}-${metric.value}-timeline-${new Date().toISOString().slice(0, 10)}.png`;
    downloadDataUrl(dataUrl, fileName);
    pushToast('success', 'Chart exported', 'A high-resolution PNG was downloaded.');
  } catch (error) {
    pushToast('error', 'Could not export the chart', error.message);
  }
}

function setTheme(nextTheme) {
  theme.value = nextTheme;
}

function openFromEmptyScanPanel() {
  openScanPanel();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && sidebarOpen.value) {
    sidebarOpen.value = false;
  }
}

function handleResize() {
  if (window.innerWidth > 1050 && sidebarOpen.value) {
    sidebarOpen.value = false;
  }
}

onMounted(() => {
  bootstrap();
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  disposed = true;
  stopPolling();
  for (const timer of toastTimers.values()) clearTimeout(timer);
  toastTimers.clear();
  document.documentElement.style.overflow = '';
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', handleResize);
});

const hasSelectedLanguages = computed(() => selectedSeries.value.length > 0);
const bootShow = computed(() => bootLoading.value && !activeJob.value);
</script>

<template>
  <div class="app-shell">
    <AppSidebar
      ref="sidebarRef"
      :open="sidebarOpen"
      :scans="savedScans"
      :active-scan-id="activeSavedId"
      :defaults="sidebarDefaults"
      :scanning="sidebarScanning"
      :loading-scans="loadingScans"
      :cloc-error="appConfig?.clocError || ''"
      :scan-error="scanError"
      :theme="theme"
      @close="closeSidebar"
      @scan="startScan"
      @load-scan="loadSavedScan"
      @delete-scan="deleteSavedScan"
      @demo="loadDemo"
      @toggle-theme="setTheme"
    />

    <transition name="backdrop">
      <button
        v-if="sidebarOpen"
        class="sidebar-backdrop"
        type="button"
        aria-label="Close navigation"
        @click="closeSidebar"
      />
    </transition>

    <div class="main-shell">
      <header class="topbar">
        <button class="icon-button menu-button" type="button" aria-label="Open navigation" @click="sidebarOpen = true">
          <Menu :size="17" />
        </button>

        <div class="topbar-context">
          <span class="context-signal" :class="{ scanning: activeJob }" />
          <span class="context-repo">{{ topbarRepo }}</span>
          <span v-if="topbarBranch" class="context-branch">
            <GitBranch :size="11" />
            {{ topbarBranch }}
          </span>
          <span v-if="activeJob" class="context-scanning">scanning history…</span>
        </div>

        <div class="topbar-actions">
          <span class="local-pill"><span /> local only</span>
          <span class="topbar-engine">{{ currentToolbarEngine }}</span>
        </div>
      </header>

      <main class="main-scroll">
        <div v-if="activeJob" class="view-wrap">
          <ScanProgress :job="activeJob" :cancelling="jobCancelling" @cancel="cancelScan" />
        </div>

        <div v-else-if="bootShow" class="boot-view">
          <div class="boot-spinner"><LoaderCircle :size="22" class="spin" /></div>
          <p>Opening workspace…</p>
        </div>

        <template v-else-if="shouldShowDashboard">
          <div class="dashboard-wrap">
            <section class="dashboard-header">
              <div class="dashboard-title-block">
                <div class="eyebrow with-pieces">
                  <span class="breadcrumb-repo" :title="currentScan.repoPath">{{ currentScan.repoName }}</span>
                  <span class="slash">/</span>
                  <span class="branch-piece"><GitBranch :size="12" />{{ currentScan.branch || currentScan.revision || 'HEAD' }}</span>
                  <span class="revision-piece">{{ currentScan.revision || 'HEAD' }}</span>
                  <span v-if="isDemo" class="demo-badge">Demo data</span>
                </div>
                <h1>{{ currentScan.repoName }}</h1>
                <div class="dashboard-meta">
                  <span><GitCommitHorizontal :size="13" />{{ scanMetaCommits }}</span>
                  <span class="meta-separator">·</span>
                  <span><CalendarRange :size="13" />{{ scanMetaRange }}</span>
                  <span class="meta-separator">·</span>
                  <span>Scanned {{ formatRelative(currentScan.generatedAt) }} in {{ formatDuration(currentScan.durationMs) }}</span>
                </div>
              </div>

              <div class="dashboard-actions">
                <button class="button secondary" type="button" @click="rescanCurrent">
                  <RefreshCw :size="14" />
                  {{ isDemo ? 'Scan your repo' : 'Rescan' }}
                </button>
                <button class="button primary" type="button" @click="exportCsv">
                  <Download :size="15" />
                  Export CSV
                </button>
              </div>
            </section>

            <section class="stats-grid" aria-label="Project size summary">
              <StatCard
                :label="metricInfo.longLabel"
                :value="formatNumber(currentTotal)"
                :detail="`${formatNumber(filesAtHead)} files at HEAD`"
                :icon="FileCode2"
                tint="var(--chart-blue)"
                :sparkline="trendValues"
              />
              <StatCard
                label="Net growth"
                :value="netGrowthLabel"
                :detail="growthDetailLabel"
                :delta="growthDeltaLabel"
                :delta-tone="netGrowthDeltaTone"
                :icon="TrendingUp"
                tint="var(--chart-green)"
              />
              <StatCard
                :label="`Peak ${metricInfo.longLabel.toLowerCase()}`"
                :value="formatNumber(peak.value)"
                :detail="peak.date ? `on ${formatDate(peak.date)}` : 'no data'"
                :icon="ChartNoAxesCombined"
                tint="var(--chart-violet)"
              />
              <StatCard
                label="Languages"
                :value="String(activeLanguageCount)"
                :detail="`${formatNumber(commitCount)} commits · ${timeSpan}`"
                :icon="Layers3"
                tint="var(--chart-amber)"
              />
            </section>

            <section class="panel chart-panel">
              <header class="chart-heading">
                <div class="chart-title-block">
                  <div class="eyebrow">Evolution</div>
                  <div class="chart-title-row">
                    <h2>{{ metricInfo.longLabel }} over time</h2>
                    <span class="series-count">{{ selectedSeries.length }} / {{ languageRows.length }} series</span>
                  </div>
                  <p>Stacked by language across {{ formatNumber(commitCount) }} commits.</p>
                </div>

                <div class="chart-controls">
                  <div class="segmented metric-switch" role="group" aria-label="Choose metric">
                    <button
                      v-for="option in metricOptions"
                      :key="option.id"
                      type="button"
                      :class="{ active: metric === option.id }"
                      :aria-pressed="metric === option.id"
                      @click="metric = option.id"
                    >
                      {{ option.label }}
                    </button>
                  </div>

                  <div class="segmented icon-switch" role="group" aria-label="Choose chart style">
                    <button
                      v-for="option in chartTypeOptions"
                      :key="option.id"
                      type="button"
                      :class="{ active: chartType === option.id }"
                      :aria-pressed="chartType === option.id"
                      :title="option.label"
                      :aria-label="option.label"
                      @click="chartType = option.id"
                    >
                      <component :is="option.icon" :size="14" :stroke-width="1.8" />
                    </button>
                  </div>

                  <button
                    class="button secondary compact export-chart-button"
                    type="button"
                    :disabled="!hasSelectedLanguages"
                    title="Download chart as PNG"
                    aria-label="Download chart as PNG"
                    @click="exportChart"
                  >
                    <ImageDown :size="14" />
                    <span class="export-label">PNG</span>
                  </button>
                </div>
              </header>

              <div class="chart-legend-bar">
                <div class="legend-scroll">
                  <button
                    v-for="language in languageRows"
                    :key="language.name"
                    class="legend-chip"
                    :class="{ inactive: !selectedSet.has(language.name) }"
                    type="button"
                    :aria-pressed="selectedSet.has(language.name)"
                    @click="toggleLanguage(language.name)"
                  >
                    <span class="legend-dot" :style="{ background: language.color }" />
                    {{ language.name }}
                  </button>
                </div>
                <span class="legend-hint">Click to toggle</span>
              </div>

              <div class="chart-area">
                <HistoryChart
                  v-if="hasSelectedLanguages"
                  :key="`${currentScan.id}:${currentScan.generatedAt}`"
                  ref="chartRef"
                  :commits="commits"
                  :languages="selectedSeries"
                  :metric="metric"
                  :chart-type="chartType"
                  :theme="theme"
                />
                <div v-else class="no-series">
                  <span class="no-series-icon"><Layers3 :size="20" /></span>
                  <strong>No languages in the chart</strong>
                  <p>Select a language above or restore all series to see the timeline.</p>
                  <button class="button secondary compact" type="button" @click="selectAllLanguages">Show all languages</button>
                </div>
              </div>

              <footer class="chart-footer">
                <span>
                  Showing <strong>{{ selectedSeries.length }}</strong> of {{ languageRows.length }} languages
                </span>
                <span class="chart-footer-total">
                  <i />
                  {{ formatNumber(visibleMetricTotal) }} visible
                  <span class="footer-divider">/</span>
                  {{ formatNumber(allMetricTotal) }} total
                </span>
                <span class="zoom-hint">Shift + scroll to zoom</span>
              </footer>
            </section>

            <div class="lower-grid">
              <LanguagePanel
                :languages="languageRows"
                :selected="selectedNames"
                :metric="metric"
                :total="allMetricTotal"
                @toggle="toggleLanguage"
                @set-color="setLanguageColor"
                @select-all="selectAllLanguages"
                @select-none="selectNoLanguages"
                @reset-colors="resetLanguageColors"
              />

              <CommitFeed
                :commits="commits"
                :metric="metric"
                :colors="languageColors"
              />
            </div>

            <footer class="dashboard-footer">
              <span>
                <Database :size="12" />
                <template v-if="isDemo">Generated sample</template>
                <template v-else>Saved locally</template>
                · {{ formatNumber(commitCount) }}<template v-if="currentScan.availableCommits > commitCount"> of {{ formatNumber(currentScan.availableCommits) }}</template> commits included
              </span>
              <span>
                {{ engineNote }} · {{ excludedCount }} excluded folders · {{ historyMode }}
                <template v-if="currentScan.options?.concurrency > 1">
                  · {{ currentScan.options.concurrency }} cloc jobs
                </template>
                <template v-if="historicalLanguageCount !== activeLanguageCount">
                  · {{ historicalLanguageCount }} seen historically
                </template>
              </span>
            </footer>
          </div>
        </template>

        <EmptyState
          v-else
          :cloc-error="appConfig?.clocError || ''"
          @demo="loadDemo"
          @scan="openFromEmptyScanPanel"
        />

        <transition name="fade">
          <div v-if="loadingScan && !bootShow" class="loading-curtain" role="status">
            <span class="loading-chip"><LoaderCircle :size="16" class="spin" /> Opening saved scan…</span>
          </div>
        </transition>
      </main>
    </div>

    <teleport to="body">
      <div class="toast-stack" aria-live="polite">
        <transition-group name="toast">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            class="toast"
            :class="toastType(toast.type)"
          >
            <span class="toast-icon">
              <CheckCircle2 v-if="toastType(toast.type) === 'success'" :size="15" />
              <AlertTriangle v-else-if="toastType(toast.type) === 'error'" :size="15" />
              <AlertTriangle v-else-if="toastType(toast.type) === 'warning'" :size="15" />
              <Info v-else :size="15" />
            </span>
            <div class="toast-copy">
              <strong>{{ toast.title }}</strong>
              <span v-if="toast.message">{{ toast.message }}</span>
            </div>
            <button class="toast-close" type="button" aria-label="Dismiss notification" @click="dismissToast(toast.id)">
              <X :size="13" />
            </button>
          </div>
        </transition-group>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.main-shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  margin-left: var(--sidebar-width);
}

.topbar {
  display: flex;
  position: sticky;
  z-index: 25;
  top: 0;
  height: 53px;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg) 83%, transparent);
  backdrop-filter: blur(18px);
}

.menu-button {
  display: none;
}

.topbar-context {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: 10.5px;
}

.context-signal {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 8%, transparent);
}

.context-signal.scanning {
  background: var(--accent);
  animation: signal-pulse 1.4s ease-in-out infinite;
}

.context-repo {
  overflow: hidden;
  max-width: 260px;
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-branch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.context-scanning {
  color: var(--text-faint);
  font-size: 9px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-left: auto;
}

.local-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 99px;
  color: var(--text-faint);
  font-size: 8.5px;
  letter-spacing: 0.02em;
}

.local-pill > span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--chart-green);
}

.topbar-engine {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.main-scroll {
  flex: 1;
}

.dashboard-wrap {
  width: 100%;
  max-width: 1540px;
  margin: 0 auto;
  padding: 29px 30px 24px;
  animation: rise-in 350ms ease both;
}

.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 23px;
  border-bottom: 1px solid var(--border-subtle);
}

.dashboard-title-block {
  min-width: 0;
}

.eyebrow.with-pieces {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  text-transform: none;
  letter-spacing: 0.02em;
}

.breadcrumb-repo {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.slash {
  color: var(--border-strong);
}

.branch-piece {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 9px;
}

.revision-piece {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.demo-badge {
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--chart-amber) 27%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--chart-amber) 7%, transparent);
  color: var(--chart-amber);
  font-size: 7.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.dashboard-header h1 {
  overflow: hidden;
  margin: 9px 0 0;
  color: var(--text);
  font-size: clamp(30px, 3.3vw, 42px);
  font-weight: 490;
  letter-spacing: -0.045em;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  color: var(--text-faint);
  font-size: 10px;
}

.dashboard-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.meta-separator {
  opacity: 0.55;
}

.dashboard-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.stats-grid {
  display: grid;
  gap: 10px;
  margin-top: 20px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(150deg, rgba(255, 255, 255, 0.018), transparent 45%),
    var(--panel);
  box-shadow: var(--shadow-sm);
}

.chart-panel {
  margin-top: 11px;
  padding: 21px 22px 15px;
}

.chart-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.chart-title-block {
  min-width: 0;
}

.chart-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 5px;
}

.chart-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 520;
  letter-spacing: -0.025em;
}

.chart-heading p {
  margin: 5px 0 0;
  color: var(--text-faint);
  font-size: 10px;
}

.series-count {
  padding: 3px 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8px;
  white-space: nowrap;
}

.chart-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.segmented {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-sunken);
}

.segmented button {
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font: inherit;
  font-size: 9.5px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.segmented button:hover {
  color: var(--text-soft);
}

.segmented button.active {
  background: var(--surface-raise);
  color: var(--text);
  box-shadow: var(--shadow-xs);
}

.icon-switch button {
  display: inline-flex;
  width: 28px;
  padding: 0;
  align-items: center;
  justify-content: center;
}

.export-chart-button {
  height: 34px;
}

.chart-legend-bar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.legend-scroll {
  display: flex;
  overflow-x: auto;
  flex: 1;
  gap: 5px;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.legend-scroll::-webkit-scrollbar {
  display: none;
}

.legend-chip {
  display: inline-flex;
  height: 25px;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 9.5px;
  white-space: nowrap;
  transition: border-color 150ms ease, background 150ms ease, opacity 150ms ease;
}

.legend-chip:hover {
  border-color: var(--border-strong);
  background: var(--surface-raise);
}

.legend-chip.inactive {
  border-color: var(--border-subtle);
  background: transparent;
  color: var(--text-faint);
  opacity: 0.5;
}

.legend-chip.inactive .legend-dot {
  opacity: 0.45;
}

.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 5%, transparent);
}

.legend-hint {
  flex: none;
  color: var(--text-faint);
  font-size: 8.5px;
}

.chart-area {
  position: relative;
  margin-top: 2px;
}

.no-series {
  display: flex;
  height: 380px;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

.no-series-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
  color: var(--text-faint);
}

.no-series strong {
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 500;
}

.no-series p {
  margin: 5px 0 14px;
  color: var(--text-faint);
  font-size: 10.5px;
}

.chart-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-faint);
  font-size: 9px;
}

.chart-footer strong {
  color: var(--text-muted);
  font-weight: 500;
}

.chart-footer-total {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  font-family: var(--font-mono);
}

.chart-footer-total i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.footer-divider {
  opacity: 0.5;
}

.zoom-hint {
  color: var(--text-faint);
  opacity: 0.75;
}

.lower-grid {
  display: grid;
  align-items: stretch;
  gap: 11px;
  margin-top: 11px;
  grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
}

.lower-grid :deep(.panel) {
  padding: 20px 21px 14px;
}

.dashboard-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 20px;
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-faint);
  font-size: 8.5px;
}

.dashboard-footer span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.boot-view {
  display: flex;
  min-height: calc(100vh - 53px);
  align-items: center;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  color: var(--text-faint);
  font-size: 10px;
  letter-spacing: 0.03em;
}

.boot-spinner {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--accent);
}

.loading-curtain {
  display: flex;
  position: fixed;
  z-index: 30;
  inset: 53px 0 0 var(--sidebar-width);
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(5px);
}

.loading-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 13px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-solid);
  box-shadow: var(--shadow-md);
  color: var(--text-muted);
  font-size: 10.5px;
}

.sidebar-backdrop {
  display: none;
  position: fixed;
  z-index: 35;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  cursor: default;
  backdrop-filter: blur(2px);
}

.toast-stack {
  display: flex;
  position: fixed;
  z-index: 100;
  right: 18px;
  bottom: 18px;
  width: min(350px, calc(100vw - 28px));
  flex-direction: column;
  gap: 7px;
  pointer-events: none;
}

.toast {
  display: flex;
  position: relative;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 11px 11px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel-solid) 95%, transparent);
  box-shadow: var(--shadow-lg);
  color: var(--text-muted);
  pointer-events: auto;
  backdrop-filter: blur(16px);
}

.toast-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.toast.success .toast-icon {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}

.toast.error .toast-icon {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
}

.toast.warning .toast-icon {
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  color: var(--warning);
}

.toast.info .toast-icon {
  background: color-mix(in srgb, var(--chart-blue) 10%, transparent);
  color: var(--chart-blue);
}

.toast-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
}

.toast-copy strong {
  color: var(--text-soft);
  font-size: 10.5px;
  font-weight: 550;
}

.toast-copy span {
  color: var(--text-faint);
  font-size: 9.5px;
  line-height: 1.45;
}

.toast-close {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
}

.toast-close:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 190ms ease, transform 190ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.backdrop-enter-active,
.backdrop-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease;
}

.backdrop-enter-from,
.backdrop-leave-to,
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (min-width: 1051px) {
  .sidebar-backdrop {
    display: none !important;
  }
}

@media (max-width: 1280px) {
  .dashboard-wrap {
    padding-right: 22px;
    padding-left: 22px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-heading {
    flex-direction: column;
    gap: 14px;
  }

  .chart-controls {
    width: 100%;
    justify-content: flex-start;
  }

  .lower-grid {
    grid-template-columns: 1fr;
  }

  .export-label {
    display: inline;
  }
}

@media (max-width: 1050px) {
  .main-shell {
    margin-left: 0;
  }

  .sidebar-backdrop {
    display: block;
  }

  .menu-button {
    display: inline-flex;
  }

  .topbar {
    padding: 0 17px;
  }

  .loading-curtain {
    left: 0;
  }
}

@media (max-width: 720px) {
  .dashboard-wrap {
    padding: 20px 14px 20px;
  }

  .dashboard-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }

  .dashboard-header h1 {
    font-size: 31px;
    white-space: normal;
  }

  .dashboard-actions {
    width: 100%;
  }

  .dashboard-actions .button {
    flex: 1;
    justify-content: center;
  }

  .dashboard-meta {
    font-size: 9px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .chart-panel {
    padding: 17px 14px 13px;
  }

  .chart-heading h2 {
    font-size: 15.5px;
  }

  .chart-controls {
    align-items: stretch;
  }

  .metric-switch {
    overflow-x: auto;
    max-width: 100%;
  }

  .metric-switch button {
    padding: 0 7px;
  }

  .chart-legend-bar {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .legend-scroll {
    width: 100%;
  }

  .legend-hint {
    display: none;
  }

  .chart-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .chart-footer-total {
    margin-left: 0;
  }

  .zoom-hint {
    display: none;
  }

  .lower-grid :deep(.panel) {
    padding: 17px 14px 13px;
  }

  .context-repo {
    max-width: 150px;
  }

  .topbar-engine {
    display: none;
  }

  .topbar {
    padding: 0 12px;
  }

  .dashboard-footer {
    flex-direction: column;
    gap: 4px;
  }

  .no-series {
    height: 300px;
  }
}

@media (max-width: 500px) {
  .local-pill {
    display: none;
  }

  .chart-controls {
    gap: 5px;
  }

  .export-chart-button .export-label {
    display: none;
  }

  .export-chart-button {
    width: 32px;
    padding: 0;
  }

  .context-branch {
    display: none;
  }

  .toast-stack {
    right: 10px;
    bottom: 10px;
  }
}

@media (max-width: 370px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}

@keyframes signal-pulse {
  0%, 100% {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 8%, transparent);
  }
  50% {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 3%, transparent);
  }
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-wrap,
  .context-signal.scanning {
    animation: none;
  }
}
</style>
