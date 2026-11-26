<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Ban, Clock3, FolderTree, GitCommitHorizontal, LoaderCircle } from 'lucide-vue-next';
import { formatDuration } from '../utils/format.js';

const props = defineProps({
  job: { type: Object, required: true },
  cancelling: { type: Boolean, default: false },
});

const emit = defineEmits(['cancel']);

const now = ref(Date.now());
let timer = null;

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  window.clearInterval(timer);
});

const progress = computed(() => props.job.progress || {});

const percent = computed(() => {
  const state = progress.value;
  if (state.phase === 'done') return 100;
  if (state.phase === 'counting' && state.total > 0) {
    return Math.min(99, 8 + (state.current / state.total) * 90);
  }
  if (state.phase === 'inspecting') return 4;
  return 2;
});

const elapsed = computed(() => {
  const start = new Date(props.job.startedAt || props.job.createdAt).getTime();
  return Math.max(0, now.value - start);
});

const eta = computed(() => {
  const state = progress.value;
  if (state.phase !== 'counting' || state.current < 2 || state.current >= state.total) return null;
  const perCommit = elapsed.value / state.current;
  return perCommit * (state.total - state.current);
});

const stepState = computed(() => {
  const state = progress.value;
  if (state.phase === 'counting') return 1;
  if (state.phase === 'done') return 2;
  return 0;
});

const repoName = computed(() => {
  const repository = props.job.options?.repoPath || '';
  return repository.split('/').filter(Boolean).at(-1) || 'repository';
});

const excludeCount = computed(() => props.job.options?.excludeDirs?.length ?? 0);
const currentCommit = computed(() => progress.value.commit);
</script>

<template>
  <div class="scan-view">
    <div class="scan-orbit" aria-hidden="true" />
    <section class="scan-card">
      <div class="scan-copy">
        <div class="eyebrow accent">Scan in progress</div>
        <h1>Reading {{ repoName }}</h1>
        <p>
          Walking the Git history and counting every tracked source file with cloc.
          Keep this tab open — successful scans are saved automatically.
        </p>

        <ol class="step-list">
          <li :class="{ active: stepState === 0, done: stepState > 0 }">
            <span class="step-index">01</span>
            <span>Inspect history</span>
          </li>
          <li :class="{ active: stepState === 1, done: stepState > 1 }">
            <span class="step-index">02</span>
            <span>Count commits</span>
          </li>
          <li :class="{ active: stepState === 2 }">
            <span class="step-index">03</span>
            <span>Chart timeline</span>
          </li>
        </ol>

        <div v-if="currentCommit" class="current-commit">
          <span class="current-icon"><GitCommitHorizontal :size="15" /></span>
          <code>{{ currentCommit.shortSha }}</code>
          <span class="current-subject">{{ currentCommit.subject }}</span>
          <span v-if="currentCommit.code" class="current-lines">{{ currentCommit.code.toLocaleString() }} LOC</span>
        </div>
        <div v-else class="current-commit is-quiet">
          <span class="current-icon"><LoaderCircle :size="15" class="spin" /></span>
          <span>{{ progress.message || 'Preparing the scan…' }}</span>
        </div>

        <div class="scan-meta">
          <span><Clock3 :size="13" /> {{ formatDuration(elapsed) }} elapsed</span>
          <span v-if="eta !== null"><LoaderCircle :size="13" /> ~{{ formatDuration(eta) }} left</span>
          <span><FolderTree :size="13" /> {{ excludeCount }} folders excluded</span>
        </div>

        <button class="button secondary danger-hover" type="button" :disabled="cancelling" @click="emit('cancel')">
          <Ban :size="15" />
          {{ cancelling ? 'Cancelling…' : 'Cancel scan' }}
        </button>
      </div>

      <div class="progress-side">
        <div class="progress-ring" :style="{ '--value': percent }">
          <div class="progress-ring-inner">
            <span class="progress-number">{{ Math.round(percent) }}<small>%</small></span>
            <span class="progress-phase">{{ progress.message || 'Starting…' }}</span>
          </div>
        </div>

        <div class="progress-facts">
          <div class="fact">
            <span class="fact-label">Commits</span>
            <span class="fact-value">
              {{ progress.current || 0 }}<small>/{{ progress.total || '—' }}</small>
            </span>
          </div>
          <div class="fact">
            <span class="fact-label">Engine</span>
            <span class="fact-value text">cloc ×{{ job.options?.concurrency || 1 }}</span>
          </div>
          <div class="fact">
            <span class="fact-label">History</span>
            <span class="fact-value text">{{ job.options?.firstParent ? 'First parent' : 'All commits' }}</span>
          </div>
        </div>

        <div class="progress-track" role="progressbar" :aria-valuenow="Math.round(percent)" aria-valuemin="0" aria-valuemax="100">
          <span class="progress-fill" :style="{ width: `${percent}%` }" />
        </div>

        <p class="side-note">
          Each commit is counted independently. A scan with many commits can take a while,
          especially on large monorepos.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.scan-view {
  display: flex;
  position: relative;
  min-height: calc(100vh - 80px);
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 48px 24px;
}

.scan-orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(820px, 100vw);
  height: min(820px, 100vw);
  border: 1px solid var(--border-subtle);
  border-radius: 50%;
  opacity: 0.55;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.scan-orbit::before,
.scan-orbit::after {
  position: absolute;
  border: 1px solid var(--border-subtle);
  border-radius: 50%;
  content: '';
}

.scan-orbit::before {
  inset: 12%;
}

.scan-orbit::after {
  inset: 28%;
}

.scan-card {
  display: grid;
  position: relative;
  width: min(960px, 100%);
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: clamp(32px, 5vw, 64px);
  padding: clamp(26px, 4vw, 48px);
  border: 1px solid var(--border);
  border-radius: 22px;
  background:
    radial-gradient(circle at 95% 5%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 32%),
    var(--panel-solid);
  box-shadow: var(--shadow-lg);
}

.scan-copy h1 {
  margin: 11px 0 0;
  color: var(--text);
  font-size: clamp(27px, 3.2vw, 39px);
  font-weight: 510;
  letter-spacing: -0.04em;
  line-height: 1.08;
}

.scan-copy p {
  max-width: 480px;
  margin: 14px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.65;
}

.step-list {
  display: flex;
  gap: 0;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
}

.step-list li {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 7px;
  padding: 9px 0;
  border-top: 1px solid var(--border);
  color: var(--text-faint);
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
}

.step-list li.active {
  border-color: var(--accent);
  color: var(--text);
}

.step-list li.done {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  color: var(--text-muted);
}

.step-index {
  font-family: var(--font-mono);
  font-size: 8px;
  opacity: 0.75;
}

.current-commit {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: 11px;
}

.current-icon {
  display: inline-flex;
  flex: none;
  color: var(--accent);
}

.current-commit code {
  flex: none;
  color: var(--text-soft);
  font-family: var(--font-mono);
  font-size: 10px;
}

.current-subject {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-lines {
  flex: none;
  font-family: var(--font-mono);
  font-size: 9px;
  opacity: 0.72;
}

.current-commit.is-quiet {
  color: var(--text-faint);
}

.scan-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 17px;
  color: var(--text-faint);
  font-size: 10.5px;
}

.scan-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.button.secondary {
  margin-top: 28px;
}

.progress-side {
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  padding-left: clamp(0px, 3vw, 28px);
  border-left: 1px solid var(--border-subtle);
}

.progress-ring {
  display: grid;
  position: relative;
  width: 172px;
  height: 172px;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--accent) calc(var(--value) * 1%), var(--surface-sunken) 0);
  transition: background 300ms ease;
}

.progress-ring::before {
  position: absolute;
  inset: 7px;
  border-radius: 50%;
  background: var(--panel-solid);
  content: '';
}

.progress-ring-inner {
  display: flex;
  position: relative;
  z-index: 1;
  align-items: center;
  flex-direction: column;
  padding: 20px;
  text-align: center;
}

.progress-number {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 36px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.07em;
  line-height: 1;
}

.progress-number small {
  color: var(--text-faint);
  font-size: 13px;
  letter-spacing: 0;
}

.progress-phase {
  overflow: hidden;
  max-width: 120px;
  margin-top: 8px;
  color: var(--text-faint);
  display: -webkit-box;
  font-size: 9.5px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.progress-facts {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 28px;
}

.fact {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-sunken);
}

.fact-label {
  color: var(--text-faint);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.fact-value {
  color: var(--text-soft);
  font-family: var(--font-mono);
  font-size: 11px;
}

.fact-value small {
  color: var(--text-faint);
  font-size: 9px;
}

.fact-value.text {
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-track {
  overflow: hidden;
  width: 100%;
  height: 4px;
  margin-top: 18px;
  border-radius: 99px;
  background: var(--surface-sunken);
}

.progress-fill {
  display: block;
  position: relative;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 65%, var(--text)), var(--accent));
  transition: width 350ms ease;
}

.progress-fill::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.36), transparent);
  content: '';
  animation: shimmer 1.8s infinite;
}

.side-note {
  margin: 16px 0 0;
  color: var(--text-faint);
  font-size: 9.5px;
  line-height: 1.55;
  text-align: center;
}

@media (max-width: 820px) {
  .scan-card {
    grid-template-columns: 1fr;
  }

  .progress-side {
    padding-top: 30px;
    padding-left: 0;
    border-top: 1px solid var(--border-subtle);
    border-left: 0;
  }

  .progress-facts {
    max-width: 360px;
  }

  .progress-track {
    max-width: 360px;
  }
}

@media (max-width: 520px) {
  .scan-view {
    min-height: auto;
    padding: 22px 14px;
  }

  .scan-card {
    gap: 26px;
    padding: 22px;
  }

  .step-list li {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
    font-size: 9px;
  }

  .scan-meta {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .progress-ring {
    width: 150px;
    height: 150px;
  }
}
</style>
