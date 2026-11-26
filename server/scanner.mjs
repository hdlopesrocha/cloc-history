import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const execFileAsync = promisify(execFile);

export const DEFAULT_EXCLUDES = [
  'node_modules',
  'bin',
  'build',
  'dist',
  'out',
  'target',
  'vendor',
  'third_party',
  'third-party',
  'external',
  'deps',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'Pods',
  'DerivedData',
  'obj',
  '.next',
  '.nuxt',
  '.cache',
  'bower_components',
  'generated',
];

export class ScanError extends Error {
  constructor(message, code = 'SCAN_ERROR') {
    super(message);
    this.name = 'ScanError';
    this.code = code;
  }
}

export function defaultScanConcurrency() {
  const requested = Number.parseInt(process.env.CLOC_HISTORY_JOBS || '', 10);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.max(1, Math.min(16, requested));
  }
  const cores = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
  return Math.max(1, Math.min(6, cores - 1));
}

function normalizeConcurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return defaultScanConcurrency();
  return Math.max(1, Math.min(16, Math.floor(numeric)));
}

const MAX_BUFFER = 64 * 1024 * 1024;
let clocVersionCache = null;

async function run(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      timeout: options.timeout ?? 0,
      cwd: options.cwd,
      signal: options.signal,
    });
    return { stdout, stderr };
  } catch (error) {
    if (options.signal?.aborted || error.name === 'AbortError') {
      throw new ScanError('The scan was cancelled.', 'CANCELLED');
    }
    if (error.code === 'ENOENT') {
      throw new ScanError(
        command === 'cloc'
          ? 'cloc is not installed. Install it from https://github.com/AlDanial/cloc and try again.'
          : `Could not find "${command}". Make sure it is installed and available on your PATH.`,
        'MISSING_COMMAND',
      );
    }
    const details = (error.stderr || error.message || '').trim();
    throw new ScanError(
      details.length > 800 ? `${details.slice(0, 800)}…` : details || `Command failed: ${command} ${args.join(' ')}`,
      'COMMAND_FAILED',
    );
  }
}

async function git(repo, args, signal) {
  return run('git', ['-C', repo, ...args], { signal });
}

export async function getClocVersion() {
  if (clocVersionCache) return clocVersionCache;
  const { stdout } = await run('cloc', ['--version']);
  clocVersionCache = stdout.trim();
  return clocVersionCache;
}

export async function inspectRepository(repoPath, signal) {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new ScanError('A repository path is required.', 'INVALID_REPO');
  }

  const trimmedPath = repoPath.trim();
  const expandedPath = /^~([\\/]|$)/.test(trimmedPath)
    ? path.join(os.homedir(), trimmedPath.slice(1).replace(/^[\\/]/, ''))
    : trimmedPath;
  const requestedPath = path.resolve(expandedPath);
  let stat;
  try {
    stat = await fs.stat(requestedPath);
  } catch {
    throw new ScanError(`The path does not exist: ${requestedPath}`, 'INVALID_REPO');
  }
  if (!stat.isDirectory()) {
    throw new ScanError('The repository path must point to a directory.', 'INVALID_REPO');
  }

  let root;
  try {
    const result = await git(requestedPath, ['rev-parse', '--show-toplevel'], signal);
    root = result.stdout.trim();
  } catch (error) {
    if (error instanceof ScanError && error.code === 'CANCELLED') throw error;
    throw new ScanError('This directory is not inside a Git repository.', 'INVALID_REPO');
  }

  const branch = await git(root, ['branch', '--show-current'], signal)
    .then((result) => result.stdout.trim())
    .catch(() => '');

  return {
    repoPath: root,
    repoName: path.basename(root),
    branch,
  };
}

function splitExcludeDirs(excludeDirs) {
  const values = Array.isArray(excludeDirs) ? excludeDirs : String(excludeDirs ?? '').split(/[\n,]/);
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

async function listCommits({ repo, revision, firstParent, maxCommits, signal }) {
  if (!revision || revision.startsWith('-')) {
    throw new ScanError('A valid revision is required.', 'INVALID_REVISION');
  }

  let resolvedRevision;
  try {
    const result = await git(repo, ['rev-parse', '--verify', `${revision}^{commit}`], signal);
    resolvedRevision = result.stdout.trim();
  } catch (error) {
    if (error instanceof ScanError && (error.code === 'CANCELLED' || error.code === 'MISSING_COMMAND')) {
      throw error;
    }
    throw new ScanError(`Revision "${revision}" could not be resolved.`, 'INVALID_REVISION');
  }

  const format = '%H%x1f%T%x1f%an%x1f%ae%x1f%cI%x1f%s';
  const args = ['log', '--reverse', `--format=${format}`];
  if (firstParent) args.push('--first-parent');
  args.push(resolvedRevision);

  const { stdout } = await git(repo, args, signal);
  const allCommits = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const fields = line.split('\x1f');
      return {
        sha: fields[0],
        tree: fields[1],
        author: fields[2] || 'Unknown',
        email: fields[3] || '',
        date: fields[4] || '',
        subject: fields.slice(5).join('\x1f') || '(no commit message)',
      };
    });

  if (allCommits.length === 0) {
    throw new ScanError('No commits were found for this revision.', 'NO_COMMITS');
  }

  let commits = allCommits;
  if (Number.isFinite(maxCommits) && maxCommits > 0 && allCommits.length > maxCommits) {
    commits = allCommits.slice(-maxCommits);
  }

  return { commits, resolvedRevision, availableCommits: allCommits.length };
}

function parseClocOutput(stdout, sha) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new ScanError(`Could not parse the line count for commit ${sha.slice(0, 8)}.`, 'CLOC_FAILED');
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    throw new ScanError(`Could not parse the line count for commit ${sha.slice(0, 8)}.`, 'CLOC_FAILED');
  }

  const languages = [];
  const totals = { code: 0, comment: 0, blank: 0, files: 0, lines: 0 };

  for (const [name, value] of Object.entries(parsed)) {
    if (name === 'header' || name === 'SUM' || !value || typeof value !== 'object') continue;
    if (!('code' in value) || !('nFiles' in value)) continue;

    const entry = {
      code: Number(value.code) || 0,
      comment: Number(value.comment) || 0,
      blank: Number(value.blank) || 0,
      files: Number(value.nFiles) || 0,
    };
    languages.push({ name, ...entry });

    totals.code += entry.code;
    totals.comment += entry.comment;
    totals.blank += entry.blank;
    totals.files += entry.files;
  }

  totals.lines = totals.code + totals.comment + totals.blank;
  languages.sort((a, b) => b.code - a.code || a.name.localeCompare(b.name));
  return { languages, totals };
}

async function countCommit({ repo, sha, excludeDirs, signal }) {
  const args = ['--git', '--json', '--quiet'];
  const cleaned = splitExcludeDirs(excludeDirs);
  if (cleaned.length) args.push(`--exclude-dir=${cleaned.join(',')}`);
  args.push(sha);

  const { stdout } = await run('cloc', args, { cwd: repo, signal });
  return parseClocOutput(stdout, sha);
}

function shortSha(sha) {
  return sha.slice(0, 8);
}

function isExcludedPath(filePath, excludedFolders) {
  if (!excludedFolders.size) return false;
  const normalized = filePath.replace(/^"|"$/g, '');
  return normalized.split(/[\\/]/).some((part) => excludedFolders.has(part));
}

async function collectCommitChurn({ repo, revision, excludeDirs, signal }) {
  const excludedFolders = new Set(splitExcludeDirs(excludeDirs));
  const baseArgs = [
    'log',
    '--reverse',
    '--root',
    '--numstat',
    '--find-renames',
    '--no-ext-diff',
    '--format=@@commit:%H',
    revision,
  ];

  let stdout;
  try {
    ({ stdout } = await git(
      repo,
      [
        'log',
        '--reverse',
        '--root',
        '--numstat',
        '--diff-merges=first-parent',
        '--find-renames',
        '--no-ext-diff',
        '--format=@@commit:%H',
        revision,
      ],
      signal,
    ));
  } catch (error) {
    // Git < 2.31 does not support --diff-merges=first-parent. Fall back to
    // normal Git log behavior, which reports no line churn for merge commits.
    if (error.code !== 'COMMAND_FAILED' || !/diff-merges/i.test(error.message)) throw error;
    ({ stdout } = await git(repo, baseArgs, signal));
  }

  const churn = new Map();
  let current = null;

  for (const line of stdout.split('\n')) {
    if (line.startsWith('@@commit:')) {
      const sha = line.slice('@@commit:'.length).trim();
      current = { added: 0, deleted: 0, filesChanged: 0 };
      churn.set(sha, current);
      continue;
    }
    if (!current || !line) continue;

    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match || isExcludedPath(match[3], excludedFolders)) continue;

    current.filesChanged += 1;
    if (match[1] === '-' || match[2] === '-') continue; // binary file
    current.added += Number(match[1]) || 0;
    current.deleted += Number(match[2]) || 0;
  }

  return churn;
}

export async function scanRepository({
  repoPath,
  revision = 'HEAD',
  excludeDirs = DEFAULT_EXCLUDES,
  firstParent = false,
  maxCommits = 0,
  concurrency = defaultScanConcurrency(),
  signal,
  onProgress = () => {},
}) {
  const startedAt = Date.now();
  const effectiveConcurrency = normalizeConcurrency(concurrency);
  onProgress({ phase: 'inspecting', current: 0, total: 0, message: 'Inspecting repository…' });

  const repo = await inspectRepository(repoPath, signal);
  onProgress({
    phase: 'inspecting',
    current: 0,
    total: 0,
    message: `Found ${repo.repoName}. Checking Git history…`,
  });

  const { commits, resolvedRevision, availableCommits } = await listCommits({
    repo: repo.repoPath,
    revision,
    firstParent: Boolean(firstParent),
    maxCommits: Number(maxCommits) || 0,
    signal,
  });

  onProgress({
    phase: 'counting',
    current: 0,
    total: commits.length,
    message: `Counting ${commits.length} commit${commits.length === 1 ? '' : 's'} with ${effectiveConcurrency} worker${effectiveConcurrency === 1 ? '' : 's'}…`,
  });

  onProgress({
    phase: 'counting',
    current: 0,
    total: commits.length,
    message: 'Collecting Git additions and deletions…',
  });
  const churnByCommit = await collectCommitChurn({
    repo: repo.repoPath,
    revision: resolvedRevision,
    excludeDirs,
    signal,
  });

  const treeCache = new Map();
  const inFlight = new Map();
  const resultCommits = new Array(commits.length);
  const processController = new AbortController();
  const forwardAbort = () => processController.abort();
  if (signal?.aborted) processController.abort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });

  let cursor = 0;
  let completed = 0;
  let cacheHits = 0;
  let stopped = false;
  let firstError = null;

  const countForCommit = async (commit) => {
    if (treeCache.has(commit.tree)) {
      cacheHits += 1;
      return treeCache.get(commit.tree);
    }
    if (inFlight.has(commit.tree)) {
      cacheHits += 1;
      return inFlight.get(commit.tree);
    }

    const pending = countCommit({
      repo: repo.repoPath,
      sha: commit.sha,
      excludeDirs,
      signal: processController.signal,
    })
      .then((counted) => {
        treeCache.set(commit.tree, counted);
        return counted;
      })
      .finally(() => {
        inFlight.delete(commit.tree);
      });

    inFlight.set(commit.tree, pending);
    return pending;
  };

  const worker = async () => {
    while (!stopped) {
      const index = cursor;
      cursor += 1;
      if (index >= commits.length) return;

      const commit = commits[index];
      try {
        const counted = await countForCommit(commit);
        const churn = churnByCommit.get(commit.sha) || { added: 0, deleted: 0, filesChanged: 0 };
        resultCommits[index] = {
          sha: commit.sha,
          shortSha: shortSha(commit.sha),
          tree: commit.tree,
          date: commit.date,
          author: commit.author,
          email: commit.email,
          subject: commit.subject,
          totals: counted.totals,
          languages: counted.languages,
          changes: churn,
        };

        completed += 1;
        onProgress({
          phase: 'counting',
          current: completed,
          total: commits.length,
          message: `${completed} / ${commits.length} commits counted`,
          commit: {
            sha: commit.sha,
            shortSha: shortSha(commit.sha),
            subject: commit.subject,
            date: commit.date,
            code: counted.totals.code,
          },
        });
      } catch (error) {
        if (!firstError) firstError = error;
        stopped = true;
        processController.abort();
      }
    }
  };

  try {
    const workerCount = Math.max(1, Math.min(effectiveConcurrency, commits.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (firstError) throw firstError;
  if (processController.signal.aborted) {
    throw new ScanError('The scan was cancelled.', 'CANCELLED');
  }

  const languageMap = new Map();
  for (const commit of resultCommits) {
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

  const last = resultCommits.at(-1);
  const churnTotals = resultCommits.reduce(
    (total, commit) => {
      total.added += commit.changes?.added || 0;
      total.deleted += commit.changes?.deleted || 0;
      total.filesChanged += commit.changes?.filesChanged || 0;
      return total;
    },
    { added: 0, deleted: 0, filesChanged: 0 },
  );

  const result = {
    id: createHash('sha1')
      .update(`${repo.repoPath}:${resolvedRevision}:${Date.now()}:${Math.random()}`)
      .digest('hex'),
    repoPath: repo.repoPath,
    repoName: repo.repoName,
    branch: repo.branch,
    revision,
    resolvedRevision,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    demo: false,
    engine: {
      name: 'cloc',
      version: clocVersionCache || await getClocVersion().catch(() => 'unknown'),
    },
    options: {
      excludeDirs: splitExcludeDirs(excludeDirs),
      firstParent: Boolean(firstParent),
      maxCommits: Number(maxCommits) || 0,
      concurrency: effectiveConcurrency,
    },
    availableCommits,
    cacheHits,
    commits: resultCommits,
    languages: [...languageMap.values()].sort((a, b) => b.code - a.code || a.name.localeCompare(b.name)),
    summary: {
      commitCount: resultCommits.length,
      firstDate: resultCommits[0]?.date ?? null,
      lastDate: last?.date ?? null,
      code: last?.totals.code ?? 0,
      comment: last?.totals.comment ?? 0,
      blank: last?.totals.blank ?? 0,
      files: last?.totals.files ?? 0,
      added: churnTotals.added,
      deleted: churnTotals.deleted,
      filesChanged: churnTotals.filesChanged,
    },
  };

  onProgress({
    phase: 'done',
    current: commits.length,
    total: commits.length,
    message: `Finished counting ${commits.length} commits`,
  });

  return result;
}

export function formatCsv(scan) {
  const languageNames = [...new Set(scan.commits.flatMap((commit) => commit.languages.map((language) => language.name)))]
    .sort((a, b) => a.localeCompare(b));

  const header = [
    'date',
    'sha',
    'short_sha',
    'author',
    'email',
    'subject',
    'code',
    'comment',
    'blank',
    'total_lines',
    'files',
    'added',
    'deleted',
    'changed_files',
    ...languageNames.flatMap((name) => [
      `${name} code`,
      `${name} comment`,
      `${name} blank`,
      `${name} files`,
    ]),
  ];

  const rows = scan.commits.map((commit) => {
    const byLanguage = new Map(commit.languages.map((language) => [language.name, language]));
    return [
      commit.date,
      commit.sha,
      commit.shortSha,
      commit.author,
      commit.email,
      commit.subject,
      commit.totals.code,
      commit.totals.comment,
      commit.totals.blank,
      commit.totals.lines,
      commit.totals.files,
      commit.changes?.added ?? 0,
      commit.changes?.deleted ?? 0,
      commit.changes?.filesChanged ?? 0,
      ...languageNames.flatMap((name) => {
        const entry = byLanguage.get(name);
        return [entry?.code ?? 0, entry?.comment ?? 0, entry?.blank ?? 0, entry?.files ?? 0];
      }),
    ];
  });

  const escape = (value) => {
    const string = String(value ?? '');
    return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
  };

  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}
