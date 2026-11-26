import { sanitizeFilename } from './format.js';

function escapeCsv(value) {
  const string = String(value ?? '');
  return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function scanToCsv(scan) {
  const languageNames = [...new Set(
    scan.commits.flatMap((commit) => commit.languages.map((language) => language.name)),
  )].sort((a, b) => a.localeCompare(b));

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
    ...languageNames.flatMap((name) => [
      `${name} code`,
      `${name} comment`,
      `${name} blank`,
      `${name} files`,
    ]),
  ];

  const rows = scan.commits.map((commit) => {
    const languages = new Map(commit.languages.map((language) => [language.name, language]));
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
      ...languageNames.flatMap((name) => {
        const entry = languages.get(name);
        return [entry?.code ?? 0, entry?.comment ?? 0, entry?.blank ?? 0, entry?.files ?? 0];
      }),
    ];
  });

  return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadScanCsv(scan) {
  if (!scan?.commits?.length) return;
  const fileName = `${sanitizeFilename(scan.repoName)}-line-history-${scan.generatedAt.slice(0, 10)}.csv`;
  const csv = `\uFEFF${scanToCsv(scan)}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
}

export function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
