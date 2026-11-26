<script setup>
import { ArrowRight, FolderGit2, GitCommitHorizontal, Layers3, ScanSearch, Sparkles } from 'lucide-vue-next';

defineProps({
  clocError: { type: String, default: '' },
});

const emit = defineEmits(['demo', 'scan']);
</script>

<template>
  <div class="empty-view">
    <div class="empty-grid">
      <section class="hero-copy">
        <div class="eyebrow accent"><span class="live-dot" /> Commit-by-commit insight</div>
        <h1>The shape of a codebase, <em>over time.</em></h1>
        <p class="hero-lede">
          Turn any Git repository into a language-aware history of its size.
          Count every commit, exclude the noise, and export the story as a chart or CSV.
        </p>

        <div v-if="clocError" class="inline-warning">
          <ScanSearch :size="15" />
          <span>{{ clocError }}</span>
        </div>

        <div class="hero-actions">
          <button class="button primary" type="button" @click="emit('demo')">
            <Sparkles :size="16" />
            Explore demo workspace
            <ArrowRight :size="14" class="action-arrow" />
          </button>
          <button class="button secondary" type="button" @click="emit('scan')">
            <FolderGit2 :size="16" />
            Scan a repository
          </button>
        </div>

        <div class="feature-row">
          <div class="feature">
            <span class="feature-icon"><GitCommitHorizontal :size="16" /></span>
            <div>
              <strong>Full history</strong>
              <span>Every commit on a branch.</span>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon"><ScanSearch :size="16" /></span>
            <div>
              <strong>Clean counts</strong>
              <span>Skip vendor and build folders.</span>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon"><Layers3 :size="16" /></span>
            <div>
              <strong>Language aware</strong>
              <span>Filter and color every series.</span>
            </div>
          </div>
        </div>
      </section>

      <section class="hero-art" aria-hidden="true">
        <div class="art-glow" />
        <div class="art-card">
          <div class="art-topbar">
            <span class="window-dots"><i /><i /><i /></span>
            <span class="art-title">timeline</span>
            <span class="art-badge">14 months</span>
          </div>
          <div class="art-chart">
            <svg viewBox="0 0 500 310" preserveAspectRatio="none">
              <defs>
                <linearGradient id="areaOne" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#5b8cff" stop-opacity="0.48" />
                  <stop offset="100%" stop-color="#5b8cff" stop-opacity="0.02" />
                </linearGradient>
                <linearGradient id="areaTwo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#3ddc97" stop-opacity="0.42" />
                  <stop offset="100%" stop-color="#3ddc97" stop-opacity="0.015" />
                </linearGradient>
                <linearGradient id="areaThree" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#b57bff" stop-opacity="0.38" />
                  <stop offset="100%" stop-color="#b57bff" stop-opacity="0.01" />
                </linearGradient>
              </defs>

              <g class="art-grid">
                <line x1="0" y1="55" x2="500" y2="55" />
                <line x1="0" y1="112" x2="500" y2="112" />
                <line x1="0" y1="169" x2="500" y2="169" />
                <line x1="0" y1="226" x2="500" y2="226" />
                <line x1="0" y1="283" x2="500" y2="283" />
                <line x1="70" y1="0" x2="70" y2="290" />
                <line x1="180" y1="0" x2="180" y2="290" />
                <line x1="290" y1="0" x2="290" y2="290" />
                <line x1="400" y1="0" x2="400" y2="290" />
              </g>

              <path d="M0,288 C38,279 65,262 97,267 C126,271 148,243 180,238 C210,233 244,246 273,213 C305,178 321,194 346,172 C375,148 399,158 429,119 C455,87 476,98 500,73 L500,290 L0,290 Z" fill="url(#areaThree)" />
              <path d="M0,288 C38,279 65,262 97,267 C126,271 148,243 180,238 C210,233 244,246 273,213 C305,178 321,194 346,172 C375,148 399,158 429,119 C455,87 476,98 500,73" fill="none" stroke="#b57bff" stroke-width="1.8" />
              <path d="M0,290 C32,281 67,285 98,270 C128,256 157,263 187,246 C225,226 250,235 279,209 C306,184 333,191 360,165 C390,136 423,146 454,108 C473,84 486,75 500,65 L500,290 L0,290 Z" fill="url(#areaTwo)" />
              <path d="M0,290 C32,281 67,285 98,270 C128,256 157,263 187,246 C225,226 250,235 279,209 C306,184 333,191 360,165 C390,136 423,146 454,108 C473,84 486,75 500,65" fill="none" stroke="#3ddc97" stroke-width="1.8" />
              <path d="M0,290 C30,287 52,276 82,281 C114,286 145,256 174,251 C208,245 230,226 263,222 C299,217 322,180 355,181 C386,183 418,139 447,126 C472,114 486,102 500,98 L500,290 L0,290 Z" fill="url(#areaOne)" />
              <path d="M0,290 C30,287 52,276 82,281 C114,286 145,256 174,251 C208,245 230,226 263,222 C299,217 322,180 355,181 C386,183 418,139 447,126 C472,114 486,102 500,98" fill="none" stroke="#5b8cff" stroke-width="2" />
              <circle cx="447" cy="126" r="3.5" fill="#5b8cff" stroke="#0c1713" stroke-width="2" />
            </svg>

            <div class="art-axis">
              <span>JAN</span><span>APR</span><span>JUL</span><span>OCT</span><span>JAN</span>
            </div>

            <div class="art-legend">
              <span><i style="background:#5b8cff" />TypeScript</span>
              <span><i style="background:#3ddc97" />Vue</span>
              <span><i style="background:#b57bff" />CSS</span>
            </div>
          </div>

          <div class="art-stats">
            <div><span>Lines of code</span><strong>48,291</strong></div>
            <div><span>Net growth</span><strong class="green">+12.8k</strong></div>
            <div><span>Commits</span><strong>164</strong></div>
          </div>
        </div>

        <div class="floating-note note-one">
          <span class="note-dot" />
          <span>Saved automatically</span>
        </div>
        <div class="floating-note note-two">
          <span class="note-label">CSV</span>
          <span>Ready to export</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.empty-view {
  display: flex;
  min-height: calc(100vh - 82px);
  align-items: center;
  padding: clamp(24px, 5vw, 72px);
}

.empty-grid {
  display: grid;
  width: min(1180px, 100%);
  align-items: center;
  gap: clamp(36px, 6vw, 84px);
  margin: 0 auto;
  grid-template-columns: minmax(0, 1.02fr) minmax(380px, 0.98fr);
}

.hero-copy {
  animation: rise 600ms ease both;
}

.hero-copy h1 {
  max-width: 640px;
  margin: 20px 0 0;
  color: var(--text);
  font-size: clamp(40px, 5.4vw, 69px);
  font-weight: 470;
  letter-spacing: -0.058em;
  line-height: 0.97;
}

.hero-copy h1 em {
  color: var(--accent);
  font-family: var(--font-serif);
  font-size: 1.04em;
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.04em;
}

.hero-lede {
  max-width: 535px;
  margin: 24px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.inline-warning {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  max-width: 530px;
  margin-top: 20px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 25%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.inline-warning svg {
  flex: none;
  margin-top: 1px;
  color: var(--danger);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}

.action-arrow {
  margin-left: 3px;
  opacity: 0.65;
  transition: transform 160ms ease;
}

.button:hover .action-arrow {
  transform: translateX(3px);
}

.feature-row {
  display: grid;
  max-width: 590px;
  gap: 0;
  margin-top: 48px;
  border-top: 1px solid var(--border-subtle);
  grid-template-columns: repeat(3, 1fr);
}

.feature {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 18px 13px 0 0;
}

.feature + .feature {
  padding-left: 16px;
  border-left: 1px solid var(--border-subtle);
}

.feature-icon {
  display: inline-flex;
  width: 29px;
  height: 29px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--accent);
}

.feature strong {
  display: block;
  color: var(--text-soft);
  font-size: 11.5px;
  font-weight: 550;
}

.feature span:not(.feature-icon) {
  display: block;
  margin-top: 3px;
  color: var(--text-faint);
  font-size: 10px;
  line-height: 1.45;
}

.hero-art {
  position: relative;
  padding: 22px 0 30px;
  animation: rise 700ms 90ms ease both;
}

.art-glow {
  position: absolute;
  top: 8%;
  left: 6%;
  width: 78%;
  height: 70%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 12%, transparent), transparent 68%);
  filter: blur(40px);
  pointer-events: none;
}

.art-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: linear-gradient(155deg, rgba(255,255,255,.026), transparent 35%), var(--panel-solid);
  box-shadow: 0 35px 90px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.03);
  transform: rotate(-1.2deg);
}

.art-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-faint);
}

.window-dots {
  display: flex;
  gap: 4px;
}

.window-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-strong);
}

.window-dots i:first-child {
  background: color-mix(in srgb, var(--accent) 55%, var(--border));
}

.art-title {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.art-badge {
  margin-left: auto;
  padding: 3px 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 99px;
  font-family: var(--font-mono);
  font-size: 8px;
}

.art-chart {
  position: relative;
  padding: 16px 15px 0;
}

.art-chart > svg {
  display: block;
  overflow: visible;
  width: 100%;
  height: auto;
}

.art-grid line {
  stroke: color-mix(in srgb, var(--text) 6%, transparent);
  stroke-dasharray: 2 5;
  stroke-width: 0.8;
}

.art-axis {
  display: flex;
  justify-content: space-between;
  padding: 4px 2px 0;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.06em;
}

.art-legend {
  display: flex;
  gap: 14px;
  padding: 13px 2px 14px;
  color: var(--text-faint);
  font-size: 9px;
}

.art-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.art-legend i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.art-stats {
  display: grid;
  margin: 0 14px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-sunken);
  grid-template-columns: repeat(3, 1fr);
}

.art-stats > div {
  padding: 11px 12px;
}

.art-stats > div + div {
  border-left: 1px solid var(--border-subtle);
}

.art-stats span {
  display: block;
  color: var(--text-faint);
  font-size: 8px;
}

.art-stats strong {
  display: block;
  margin-top: 4px;
  color: var(--text-soft);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.03em;
}

.art-stats strong.green {
  color: var(--success);
}

.floating-note {
  display: flex;
  position: absolute;
  align-items: center;
  gap: 7px;
  padding: 8px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: color-mix(in srgb, var(--panel-solid) 88%, transparent);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
  color: var(--text-muted);
  font-size: 9.5px;
  backdrop-filter: blur(10px);
}

.note-one {
  right: 16px;
  bottom: -15px;
  animation: float 5s ease-in-out infinite;
}

.note-two {
  bottom: -13px;
  left: -20px;
  animation: float 6s 0.8s ease-in-out infinite;
}

.note-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 12%, transparent);
}

.note-label {
  display: inline-flex;
  height: 17px;
  align-items: center;
  padding: 0 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 7.5px;
  font-weight: 600;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@media (max-width: 1060px) {
  .empty-grid {
    grid-template-columns: 1fr;
    max-width: 650px;
  }

  .hero-copy h1 {
    max-width: 580px;
  }

  .hero-art {
    max-width: 540px;
    width: min(100%, 540px);
    margin: 0 auto;
  }

  .feature-row {
    margin-top: 36px;
  }
}

@media (max-width: 620px) {
  .empty-view {
    min-height: auto;
    padding: 30px 18px;
  }

  .hero-copy h1 {
    font-size: clamp(38px, 12vw, 54px);
  }

  .hero-lede {
    font-size: 13px;
  }

  .hero-actions {
    flex-direction: column;
  }

  .hero-actions .button {
    justify-content: center;
    width: 100%;
  }

  .feature-row {
    grid-template-columns: 1fr;
  }

  .feature {
    padding: 13px 0;
    border-top: 1px solid var(--border-subtle);
  }

  .feature + .feature {
    padding-left: 0;
    border-left: 0;
  }

  .hero-art {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-copy,
  .hero-art,
  .floating-note {
    animation: none;
  }
}
</style>
