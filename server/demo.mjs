import { createHash } from 'node:crypto';
import { DEFAULT_EXCLUDES } from './scanner.mjs';

const LANGUAGE_PROFILES = [
  { name: 'TypeScript', weight: 31, firstAt: 0, initial: 2860, comments: 0.07, blanks: 0.16, linesPerFile: 165 },
  { name: 'Vue', weight: 23, firstAt: 0, initial: 1980, comments: 0.025, blanks: 0.13, linesPerFile: 145 },
  { name: 'CSS', weight: 11, firstAt: 1, initial: 840, comments: 0.08, blanks: 0.14, linesPerFile: 210 },
  { name: 'JavaScript', weight: 8, firstAt: 0, initial: 620, comments: 0.06, blanks: 0.15, linesPerFile: 155 },
  { name: 'JSON', weight: 3, firstAt: 0, initial: 240, comments: 0, blanks: 0.03, linesPerFile: 95 },
  { name: 'Markdown', weight: 7, firstAt: 0, initial: 340, comments: 0, blanks: 0.27, linesPerFile: 80 },
  { name: 'Shell', weight: 3, firstAt: 6, initial: 110, comments: 0.11, blanks: 0.18, linesPerFile: 90 },
  { name: 'Python', weight: 5, firstAt: 28, initial: 280, comments: 0.18, blanks: 0.17, linesPerFile: 125 },
  { name: 'SQL', weight: 4, firstAt: 48, initial: 360, comments: 0.16, blanks: 0.12, linesPerFile: 150 },
  { name: 'YAML', weight: 3, firstAt: 68, initial: 190, comments: 0.14, blanks: 0.13, linesPerFile: 65 },
  { name: 'HTML', weight: 2, firstAt: 0, initial: 190, comments: 0.07, blanks: 0.11, linesPerFile: 120 },
  { name: 'Go', weight: 2, firstAt: 92, initial: 410, comments: 0.1, blanks: 0.15, linesPerFile: 170 },
];

const AUTHORS = [
  ['Mira Chen', 'mira@example.dev'],
  ['Jonas Weber', 'jonas@example.dev'],
  ['Ari Okafor', 'ari@example.dev'],
  ['Sam Rivera', 'sam@example.dev'],
  ['Noor Haddad', 'noor@example.dev'],
];

const MESSAGES = [
  'feat: bootstrap the dashboard shell',
  'feat: add repository history API',
  'chore: wire up formatting and lint rules',
  'feat: render the first language timeline',
  'fix: align tooltip values after filtering',
  'refactor: extract the language color palette',
  'feat: export the current view as CSV',
  'test: cover scanner edge cases',
  'style: tighten spacing in the empty state',
  'feat: persist selected languages between scans',
  'perf: cache counts for commits sharing a tree',
  'fix: keep long commit subjects readable',
  'feat: add PNG chart export',
  'chore: upgrade the chart renderer',
  'feat: brush-to-zoom the time axis',
  'fix: correct date bucketing near midnight',
  'refactor: move scan controls into a composable',
  'feat: add a language composition panel',
  'docs: document scanner setup and flags',
  'fix: debounce repository path validation',
  'feat: summarize growth since the first commit',
  'test: add history sampling snapshots',
  'refactor: simplify job progress events',
  'style: tune chart colors for contrast',
  'feat: introduce keyboard navigation for filters',
  'fix: handle repositories with no source files',
  'perf: narrow language payloads sent to the client',
  'feat: add first-parent history option',
  'chore: split server and client development ports',
  'feat: add recent scan history',
  'fix: ignore directories named generated anywhere in the tree',
  'refactor: normalize totals in the API response',
  'docs: add a short architecture overview',
  'feat: add a compact metric selector',
  'fix: restore colors after clearing local storage',
  'feat: show net change on recent commits',
  'style: improve focus states across controls',
  'feat: allow custom colors per language',
  'fix: avoid flicker when a saved scan loads',
  'test: verify CSV escaping for quoted subjects',
  'feat: add line and column modes to the chart',
  'perf: downsample long chart series',
  'chore: remove an unused dependency',
  'feat: add branch and revision metadata',
  'fix: keep chart axis labels legible on narrow screens',
  'refactor: group language stats for faster scans',
  'feat: show total files alongside lines',
  'docs: mention required cloc version',
  'feat: make exclusions editable per scan',
  'fix: validate empty revision input',
  'feat: add a language search filter',
  'style: introduce a softer dark theme',
  'feat: add a light appearance',
  'fix: prevent overlapping chart legends',
  'perf: reduce layout work while scanning',
  'feat: include commit authors in CSV exports',
  'chore: add favicon and app metadata',
  'feat: add a cancel action for long scans',
  'fix: handle renamed languages gracefully',
  'refactor: unify number formatting helpers',
  'feat: show commit-level detail on hover',
  'test: add a fixture with excluded folders',
  'feat: add chart download feedback',
  'style: refine sidebar navigation',
  'fix: keep toasts readable in light mode',
  'feat: remember the repository path',
  'perf: abort cloc when a scan is cancelled',
  'refactor: separate scan jobs from saved scans',
  'feat: add an at-a-glance language mix',
  'docs: add CLI usage examples',
  'fix: clamp impossible negative deltas',
  'feat: add supporting files to the breakdown',
  'style: improve typography scale',
  'feat: add a demo workspace',
  'fix: render charts after fonts settle',
  'chore: tidy the project scripts',
  'feat: add scan progress streaming',
  'fix: avoid scanning symlinked paths twice',
  'feat: show all-time language peak values',
  'refactor: simplify chart option construction',
  'feat: add accessible table labels',
  'fix: align the composition bar with filters',
  'feat: add a revised empty state',
  'perf: prune repeated tree hashes',
  'feat: color language labels consistently',
  'fix: handle commits with empty messages',
  'feat: add CSV download for all commits',
  'docs: add screenshots and feature list',
  'feat: handle monorepo roots',
  'fix: respect nested folder exclusions',
  'test: add a large-history checkpoint',
  'feat: add a latest-N scan limit',
  'style: add subtle grid lines to charts',
  'feat: surface scan duration',
  'fix: correct first commit growth baseline',
  'feat: add hover linking between panels',
  'refactor: clean up API error messages',
  'feat: persist the last used theme',
  'fix: restore chart zoom on theme change',
  'feat: add a relative time range',
  'perf: skip unchanged language series',
  'feat: polish the scan completion state',
  'chore: update the README',
  'feat: add a language share percentage',
  'fix: handle CSV headers with commas',
  'feat: remember chart type per browser',
  'style: align action buttons in the header',
  'feat: add a quick rescan action',
  'test: verify cancellation cleanup',
  'feat: add a total line option',
  'fix: prevent all-language selection overflow',
  'feat: add language-level reset control',
  'refactor: centralize color overrides',
  'feat: add a compact commit feed',
  'fix: handle scans with fewer than two commits',
  'style: refine mobile navigation',
  'feat: add a range summary for the visible window',
  'perf: avoid recomputing chart data on hover',
  'feat: make dates locale-aware',
  'fix: keep totals consistent with visible series',
  'feat: add a provenance footer',
  'chore: add release notes',
];

function mulberry32(seed) {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value) {
  return Math.max(0, Math.round(value));
}

export function createDemoScan() {
  const random = mulberry32(20261107);
  const commitCount = 164;
  const states = new Map();
  const commits = [];
  let cursor = new Date('2024-08-01T09:14:00.000Z').getTime();

  for (let index = 0; index < commitCount; index += 1) {
    cursor += (2 + Math.floor(random() * 7)) * 24 * 60 * 60 * 1000;
    const isRefactor = index > 18 && index % 19 === 0;
    const isSmallFix = index > 10 && random() < 0.2;
    const activeProfiles = LANGUAGE_PROFILES.filter((profile) => profile.firstAt <= index);
    const chosenProfile = activeProfiles[Math.floor(random() * activeProfiles.length)];
    const subjects = isRefactor
      ? [
          'refactor: simplify the chart data pipeline',
          'refactor: remove duplicate language handling',
          'refactor: consolidate layout primitives',
          'refactor: split the scanner into focused modules',
        ]
      : MESSAGES;

    for (const profile of activeProfiles) {
      if (!states.has(profile.name)) {
        states.set(profile.name, {
          code: profile.initial,
          commentRatio: profile.comments,
          blankRatio: profile.blanks,
          linesPerFile: profile.linesPerFile,
        });
      }
    }

    if (index === 0) {
      // The first commit establishes the initial application skeleton.
    } else {
      const add = isSmallFix ? 40 + random() * 130 : 220 + random() * 760;
      const focus = random() < 0.35 ? chosenProfile : null;

      for (const profile of activeProfiles) {
        const state = states.get(profile.name);
        let delta = 0;

        if (isRefactor) {
          if (profile === chosenProfile || random() < 0.16) {
            delta = -(state.code * (0.035 + random() * 0.08));
          } else if (random() < 0.3) {
            delta = add * 0.07 * random();
          }
        } else if (isSmallFix) {
          if (profile === chosenProfile) delta = add * 0.4;
          else if (random() < 0.35) delta = (random() - 0.45) * 70;
        } else if (profile === focus) {
          delta = add * (0.35 + random() * 0.35);
        } else if (random() < (profile.weight / 100) * 3.2) {
          delta = add * (profile.weight / 100) * (0.5 + random());
        }

        state.code = Math.max(0, state.code + delta);
      }
    }

    const languages = [];
    const totals = { code: 0, comment: 0, blank: 0, files: 0, lines: 0 };
    for (const profile of activeProfiles) {
      const state = states.get(profile.name);
      const code = round(state.code);
      const comment = round(code * state.commentRatio + (index % 5) * 2);
      const blank = round(code * state.blankRatio + (index % 7) * 2);
      const fileSeed = Math.max(1, Math.round(code / state.linesPerFile));
      const files = Math.max(1, fileSeed + (index % 4 === 0 ? 1 : 0));
      if (code === 0) continue;
      languages.push({ name: profile.name, code, comment, blank, files });
      totals.code += code;
      totals.comment += comment;
      totals.blank += blank;
      totals.files += files;
    }
    totals.lines = totals.code + totals.comment + totals.blank;
    languages.sort((a, b) => b.code - a.code || a.name.localeCompare(b.name));

    const previousTotals = commits.at(-1)?.totals;
    const netLineChange = index === 0 ? totals.lines : totals.lines - (previousTotals?.lines ?? 0);
    const churnBase = isRefactor
      ? 900 + random() * 2400
      : isSmallFix
        ? 8 + random() * 45
        : 40 + random() * 260;
    let added;
    let deleted;
    if (index === 0) {
      added = totals.lines;
      deleted = 0;
    } else if (netLineChange >= 0) {
      deleted = round(churnBase);
      added = netLineChange + deleted;
    } else {
      added = round(churnBase);
      deleted = added - netLineChange;
    }

    const author = AUTHORS[Math.floor(random() * AUTHORS.length)];
    const subject = index === 0 ? 'feat: initial commit' : subjects[Math.floor(random() * subjects.length)];
    const date = new Date(cursor).toISOString();
    const sha = createHash('sha1').update(`${index}:${subject}:${date}`).digest('hex');

    commits.push({
      sha,
      shortSha: sha.slice(0, 8),
      tree: createHash('sha1').update(`tree:${index}:${totals.code}`).digest('hex'),
      date,
      author: author[0],
      email: author[1],
      subject,
      totals,
      languages,
      changes: {
        added: round(added),
        deleted: round(deleted),
        filesChanged: Math.max(1, Math.round(1 + random() * Math.min(activeProfiles.length, 14))),
      },
    });
  }

  const languageMap = new Map();
  for (const commit of commits) {
    for (const language of commit.languages) {
      const entry = languageMap.get(language.name) || {
        name: language.name,
        code: 0,
        comment: 0,
        blank: 0,
        files: 0,
        firstSeen: commit.date,
        lastSeen: commit.date,
      };
      entry.code = Math.max(entry.code, language.code);
      entry.comment = Math.max(entry.comment, language.comment);
      entry.blank = Math.max(entry.blank, language.blank);
      entry.files = Math.max(entry.files, language.files);
      entry.lastSeen = commit.date;
      languageMap.set(language.name, entry);
    }
  }

  const last = commits.at(-1);
  const churnTotals = commits.reduce(
    (total, commit) => {
      total.added += commit.changes.added;
      total.deleted += commit.changes.deleted;
      total.filesChanged += commit.changes.filesChanged;
      return total;
    },
    { added: 0, deleted: 0, filesChanged: 0 },
  );

  return {
    id: 'demo',
    repoPath: '/example/atlas-console',
    repoName: 'atlas-console',
    branch: 'main',
    revision: 'HEAD',
    resolvedRevision: commits.at(-1).sha,
    generatedAt: new Date().toISOString(),
    durationMs: 24815,
    demo: true,
    engine: { name: 'demo dataset', version: 'seeded sample' },
    options: {
      excludeDirs: DEFAULT_EXCLUDES,
      firstParent: true,
      maxCommits: 0,
    },
    availableCommits: commitCount,
    cacheHits: 7,
    commits,
    languages: [...languageMap.values()].sort((a, b) => b.code - a.code || a.name.localeCompare(b.name)),
    summary: {
      commitCount,
      firstDate: commits[0].date,
      lastDate: last.date,
      code: last.totals.code,
      comment: last.totals.comment,
      blank: last.totals.blank,
      files: last.totals.files,
      added: churnTotals.added,
      deleted: churnTotals.deleted,
      filesChanged: churnTotals.filesChanged,
    },
  };
}
