#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  scanRepository,
  formatCsv,
  defaultScanConcurrency,
  DEFAULT_EXCLUDES,
} from '../server/scanner.mjs';

const HELP = `
cloc-history — commit-by-commit line counts for Git repositories

USAGE
  cloc-history [repository] [options]
  npm run scan -- --repo ../my-project --out history.csv

OPTIONS
  -r, --repo <path>       Repository path (default: current directory)
      --revision <rev>    Branch, tag, or commit to scan (default: HEAD)
  -e, --exclude <dirs>    Comma-separated folder names to skip.
                          Replaces the default exclusion list.
                          Default: ${DEFAULT_EXCLUDES.join(', ')}
      --first-parent      Walk only the first-parent history
  -m, --max <n>           Count only the latest n commits (default: all)
  -j, --jobs <n>          Parallel cloc processes (default: ${defaultScanConcurrency()}, max: 16)
  -o, --out <file>        CSV output path. Use "-" for stdout.
                          Default: <repo>-line-history.csv
      --json <file>       Also write the raw scan data as JSON
      --quiet             Hide progress output
  -h, --help              Show this help
  -v, --version           Show the version

REQUIREMENTS
  Git and cloc (https://github.com/AlDanial/cloc) must be installed.

The CSV includes totals and a full code/comment/blank/file breakdown for
every language at every commit.
`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      repo: { type: 'string', short: 'r' },
      revision: { type: 'string', default: 'HEAD' },
      exclude: { type: 'string', short: 'e', multiple: true },
      'first-parent': { type: 'boolean', default: false },
      max: { type: 'string', short: 'm', default: '0' },
      jobs: { type: 'string', short: 'j' },
      out: { type: 'string', short: 'o' },
      json: { type: 'string' },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n\n${HELP.trim()}\n`);
  process.exit(1);
}

const { values, positionals } = parsed;
if (values.help) {
  process.stdout.write(`${HELP.trim()}\n`);
  process.exit(0);
}
if (values.version) {
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const repo = values.repo || positionals[0] || '.';
const maxCommits = Number(values.max) || 0;
if (maxCommits < 0) {
  process.stderr.write('Error: --max must be zero or a positive number.\n');
  process.exit(1);
}

const concurrency = values.jobs === undefined ? defaultScanConcurrency() : Number(values.jobs);
if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 16) {
  process.stderr.write('Error: --jobs must be between 1 and 16.\n');
  process.exit(1);
}

const excludeDirs = values.exclude?.length
  ? values.exclude.flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean)
  : DEFAULT_EXCLUDES;

const controller = new AbortController();
let signalCount = 0;
function handleInterrupt() {
  signalCount += 1;
  if (signalCount > 1) process.exit(130);
  process.stderr.write('\nCancelling the scan…\n');
  controller.abort();
  setTimeout(() => process.exit(130), 4000).unref();
}
process.on('SIGINT', handleInterrupt);
process.on('SIGTERM', handleInterrupt);

const quiet = values.quiet;
let lastProgress = '';

function onProgress(progress) {
  if (quiet) return;
  if (progress.phase === 'counting') {
    const current = progress.current || 0;
    const total = progress.total || 0;
    const bytesSaved = progress.commit?.code ? ` · ${progress.commit.code.toLocaleString()} LOC` : '';
    const line = `Counting commits  ${current}/${total}${bytesSaved}`;
    if (line !== lastProgress) {
      process.stderr.write(`\r${line.padEnd(72, ' ')}`);
      lastProgress = line;
    }
  } else if (progress.message && progress.phase !== 'done') {
    process.stderr.write(`\r${String(progress.message).padEnd(72, ' ')}`);
  }
}

let result;
try {
  result = await scanRepository({
    repoPath: repo,
    revision: values.revision,
    excludeDirs,
    firstParent: values['first-parent'],
    maxCommits,
    concurrency,
    signal: controller.signal,
    onProgress,
  });
  if (!quiet && lastProgress) process.stderr.write('\n');
} catch (error) {
  if (!quiet) process.stderr.write('\n');
  if (error.code === 'CANCELLED') {
    process.stderr.write('Scan cancelled.\n');
    process.exit(130);
  }
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
}

const csv = `\uFEFF${formatCsv(result)}`;
let outputPath = values.out;
if (!outputPath) {
  outputPath = `${result.repoName}-line-history-${result.generatedAt.slice(0, 10)}.csv`;
}

if (outputPath === '-') {
  process.stdout.write(csv);
  if (!csv.endsWith('\n')) process.stdout.write('\n');
} else {
  const absoluteOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, csv, 'utf8');
  if (!quiet) process.stderr.write(`CSV   ${absoluteOutput}\n`);
}

if (values.json) {
  const absoluteJson = path.resolve(values.json);
  await fs.mkdir(path.dirname(absoluteJson), { recursive: true });
  await fs.writeFile(absoluteJson, JSON.stringify(result, null, 2), 'utf8');
  if (!quiet) process.stderr.write(`JSON  ${absoluteJson}\n`);
}

if (!quiet) {
  const langs = result.languages.length;
  const final = result.summary;
  process.stderr.write(
    `Done  ${result.commits.length} commits · ${final.code.toLocaleString()} code lines · +${(final.added ?? 0).toLocaleString()}/−${(final.deleted ?? 0).toLocaleString()} churn · ${langs} languages\n`,
  );
}
