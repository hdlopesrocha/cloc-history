import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  scanRepository,
  inspectRepository,
  getClocVersion,
  formatCsv,
  defaultScanConcurrency,
  DEFAULT_EXCLUDES,
  ScanError,
} from './scanner.mjs';
import { createDemoScan } from './demo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.CLOC_HISTORY_DATA
  ? path.resolve(process.env.CLOC_HISTORY_DATA)
  : path.join(APP_ROOT, '.data');
const SCAN_DIR = path.join(DATA_DIR, 'scans');
const DIST_DIR = path.join(APP_ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
const jobs = new Map();

app.use(express.json({ limit: '1mb' }));

function normalizeExcludes(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
  const cleaned = [...new Set(values.map((entry) => String(entry).trim()).filter(Boolean))];

  if (cleaned.length > 100) {
    throw new ScanError('Please use no more than 100 excluded folders.', 'INVALID_OPTIONS');
  }

  for (const entry of cleaned) {
    if (entry.length > 100 || /[\\/]/.test(entry)) {
      throw new ScanError(
        `“${entry}” is not a valid excluded folder. Use a folder name such as node_modules or third_party.`,
        'INVALID_OPTIONS',
      );
    }
  }

  return cleaned;
}

function normalizeScanOptions(body = {}) {
  const repoPath = typeof body.repoPath === 'string' ? body.repoPath.trim() : '';
  if (!repoPath) {
    throw new ScanError('Enter the path to a local Git repository.', 'INVALID_REPO');
  }
  if (repoPath.length > 4096) {
    throw new ScanError('The repository path is too long.', 'INVALID_REPO');
  }

  const revision = typeof body.revision === 'string' && body.revision.trim()
    ? body.revision.trim()
    : 'HEAD';
  if (revision.startsWith('-') || revision.length > 200) {
    throw new ScanError('Enter a valid branch, tag, or commit.', 'INVALID_REVISION');
  }

  const rawLimit = Number(body.maxCommits ?? 0);
  if (!Number.isFinite(rawLimit) || rawLimit < 0 || rawLimit > 100000) {
    throw new ScanError('The commit limit must be between 0 and 100,000.', 'INVALID_OPTIONS');
  }

  const rawConcurrency = body.concurrency ?? defaultScanConcurrency();
  const concurrency = Number(rawConcurrency);
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new ScanError('Parallel cloc jobs must be between 1 and 16.', 'INVALID_OPTIONS');
  }

  return {
    repoPath,
    revision,
    excludeDirs: normalizeExcludes(body.excludeDirs ?? DEFAULT_EXCLUDES),
    firstParent: body.firstParent === true,
    maxCommits: Math.floor(rawLimit),
    concurrency: Math.floor(concurrency),
  };
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    error: job.error,
    cancelled: job.status === 'cancelled',
    options: job.options,
    result: job.status === 'done' ? job.result : null,
  };
}

function scanMeta(scan) {
  return {
    id: scan.id,
    repoName: scan.repoName,
    repoPath: scan.repoPath,
    branch: scan.branch,
    revision: scan.revision,
    generatedAt: scan.generatedAt,
    commitCount: scan.summary?.commitCount ?? scan.commits.length,
    availableCommits: scan.availableCommits ?? scan.commits.length,
    code: scan.summary?.code ?? 0,
    added: scan.summary?.added ?? 0,
    deleted: scan.summary?.deleted ?? 0,
    languageCount: scan.languages.length,
    durationMs: scan.durationMs ?? 0,
    firstDate: scan.summary?.firstDate ?? null,
    lastDate: scan.summary?.lastDate ?? null,
    firstParent: scan.options?.firstParent ?? false,
  };
}

async function ensureDataDirs() {
  await fs.mkdir(SCAN_DIR, { recursive: true });
}

async function writeJsonAtomic(filePath, data) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data), 'utf8');
  await fs.rename(temporary, filePath);
}

async function saveScan(scan) {
  await ensureDataDirs();
  await writeJsonAtomic(path.join(SCAN_DIR, `${scan.id}.json`), scan);
  await writeJsonAtomic(path.join(SCAN_DIR, `${scan.id}.meta.json`), scanMeta(scan));
}

async function listSavedScans() {
  await ensureDataDirs();
  const files = await fs.readdir(SCAN_DIR);
  const metas = await Promise.all(
    files
      .filter((file) => file.endsWith('.meta.json'))
      .map(async (file) => {
        try {
          const raw = await fs.readFile(path.join(SCAN_DIR, file), 'utf8');
          const data = JSON.parse(raw);
          return data?.id ? data : null;
        } catch {
          return null;
        }
      }),
  );

  return metas
    .filter(Boolean)
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
}

function validateScanId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

app.get('/api/health', async (_req, res) => {
  let cloc = null;
  let clocError = null;
  try {
    cloc = await getClocVersion();
  } catch (error) {
    clocError = error.message;
  }
  res.json({
    ok: true,
    cloc,
    clocError,
    node: process.version,
    cwd: process.cwd(),
    dataDir: DATA_DIR,
  });
});

app.get('/api/config', async (_req, res) => {
  let cloc = null;
  let clocError = null;
  try {
    cloc = await getClocVersion();
  } catch (error) {
    clocError = error.message;
  }

  const defaultRepoPath = process.env.CLOC_HISTORY_REPO || process.cwd();
  let defaultRepo = null;
  try {
    defaultRepo = await inspectRepository(defaultRepoPath);
  } catch {
    // The app directory is not necessarily a Git repository.
  }

  res.json({
    defaults: {
      repoPath: defaultRepo?.repoPath ?? defaultRepoPath,
      revision: 'HEAD',
      excludeDirs: DEFAULT_EXCLUDES,
      firstParent: false,
      maxCommits: 0,
      concurrency: defaultScanConcurrency(),
    },
    cloc,
    clocError,
    node: process.version,
    cwd: process.cwd(),
  });
});

app.get('/api/scans', async (_req, res, next) => {
  try {
    res.json({ scans: await listSavedScans() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/scans/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateScanId(id)) {
      return res.status(400).json({ error: 'Invalid scan id.' });
    }
    const raw = await fs.readFile(path.join(SCAN_DIR, `${id}.json`), 'utf8');
    res.json({ scan: JSON.parse(raw) });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'That saved scan no longer exists.' });
    }
    next(error);
  }
});

app.delete('/api/scans/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateScanId(id)) {
      return res.status(400).json({ error: 'Invalid scan id.' });
    }
    await Promise.all([
      fs.rm(path.join(SCAN_DIR, `${id}.json`), { force: true }),
      fs.rm(path.join(SCAN_DIR, `${id}.meta.json`), { force: true }),
    ]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/scans/:id/csv', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateScanId(id)) {
      return res.status(400).json({ error: 'Invalid scan id.' });
    }
    const raw = await fs.readFile(path.join(SCAN_DIR, `${id}.json`), 'utf8');
    const scan = JSON.parse(raw);
    const fileName = `${scan.repoName}-${scan.generatedAt.slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replaceAll('"', '')}"`);
    res.send(`\uFEFF${formatCsv(scan)}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'That saved scan no longer exists.' });
    }
    next(error);
  }
});

app.post('/api/scan', async (req, res, next) => {
  try {
    const options = normalizeScanOptions(req.body);
    const id = randomUUID();
    const controller = new AbortController();
    const job = {
      id,
      status: 'running',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      progress: {
        phase: 'starting',
        current: 0,
        total: 0,
        message: 'Preparing scan…',
      },
      error: null,
      result: null,
      options,
      controller,
    };
    jobs.set(id, job);

    res.status(202).json({ job: publicJob(job) });

    void (async () => {
      job.startedAt = new Date().toISOString();
      try {
        const result = await scanRepository({
          ...options,
          signal: controller.signal,
          onProgress: (progress) => {
            job.progress = progress;
          },
        });

        job.result = result;
        try {
          await saveScan(result);
        } catch (error) {
          console.error('Could not save scan:', error);
        }
        job.status = 'done';
        job.finishedAt = new Date().toISOString();
        job.progress = {
          phase: 'done',
          current: result.commits.length,
          total: result.commits.length,
          message: 'Scan complete',
        };
      } catch (error) {
        const cancelled = error.code === 'CANCELLED';
        job.status = cancelled ? 'cancelled' : 'error';
        job.finishedAt = new Date().toISOString();
        job.error = cancelled ? 'Scan cancelled.' : error.message;
        job.progress = {
          ...job.progress,
          phase: cancelled ? 'cancelled' : 'error',
          message: job.error,
        };
        if (!cancelled) console.error('Scan failed:', error);
      }
    })();

    return undefined;
  } catch (error) {
    return next(error);
  }
});

app.get('/api/scan/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Scan job not found.' });
  }
  return res.json({ job: publicJob(job) });
});

app.post('/api/scan/:id/cancel', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Scan job not found.' });
  }
  if (job.status !== 'running') {
    return res.status(409).json({ error: 'That scan is no longer running.' });
  }
  job.controller.abort();
  return res.json({ ok: true });
});

app.get('/api/demo', (_req, res) => {
  res.json({ scan: createDemoScan() });
});

app.use(express.static(DIST_DIR, { index: false }));

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/') || path.extname(req.path)) {
    return next();
  }
  const indexFile = path.join(DIST_DIR, 'index.html');
  if (!existsSync(indexFile)) {
    return res
      .status(503)
      .send('The front end has not been built yet. Run “npm run dev” or build it with “npm run build”.');
  }
  return res.sendFile(indexFile);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof ScanError || error?.name === 'ScanError') {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }
  console.error(error);
  return res.status(500).json({ error: error?.message || 'An unexpected server error occurred.' });
});

// Jobs are intentionally ephemeral; completed scans live on disk.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.finishedAt && new Date(job.finishedAt).getTime() < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000).unref();

app.listen(PORT, HOST, async () => {
  let cloc = 'not available';
  try {
    cloc = await getClocVersion();
  } catch {
    // The scan endpoint reports this with a useful message.
  }
  console.log(`\n  cloc-history API  http://${HOST}:${PORT}`);
  console.log(`  engine            cloc ${cloc}`);
  console.log(`  data              ${DATA_DIR}\n`);
});
