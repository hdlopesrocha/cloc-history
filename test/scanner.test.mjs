import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoScan } from '../server/demo.mjs';
import { formatCsv } from '../server/scanner.mjs';

test('demo scan is deterministic and internally consistent', () => {
  const first = createDemoScan();
  const second = createDemoScan();

  assert.equal(first.commits.length, 164);
  assert.equal(second.commits.length, first.commits.length);
  assert.equal(first.languages.length, 12);
  assert.equal(first.commits[0].sha, second.commits[0].sha);
  assert.equal(first.commits.at(-1).sha, second.commits.at(-1).sha);
  assert.equal(first.summary.code, first.commits.at(-1).totals.code);

  for (const commit of first.commits) {
    const languageCode = commit.languages.reduce((sum, language) => sum + language.code, 0);
    assert.equal(commit.totals.code, languageCode);
    assert.equal(
      commit.totals.lines,
      commit.totals.code + commit.totals.comment + commit.totals.blank,
    );
    assert.ok(commit.totals.code >= 0);
    assert.ok(commit.languages.length > 0);
    assert.ok(commit.changes.added >= 0);
    assert.ok(commit.changes.deleted >= 0);
    assert.ok(commit.changes.filesChanged >= 1);
    assert.equal(
      commit.changes.added - commit.changes.deleted,
      first.commits[first.commits.indexOf(commit) - 1]
        ? commit.totals.lines - first.commits[first.commits.indexOf(commit) - 1].totals.lines
        : commit.totals.lines,
    );
  }

  const added = first.commits.reduce((sum, commit) => sum + commit.changes.added, 0);
  const deleted = first.commits.reduce((sum, commit) => sum + commit.changes.deleted, 0);
  assert.equal(first.summary.added, added);
  assert.equal(first.summary.deleted, deleted);
});

test('CSV export includes totals, per-language columns, and escaped fields', () => {
  const scan = {
    commits: [
      {
        date: '2026-01-02T03:04:05.000Z',
        sha: '0123456789abcdef',
        shortSha: '01234567',
        author: 'Ada Lovelace',
        email: 'ada@example.test',
        subject: 'feat: add "quoted", commas',
        totals: { code: 12, comment: 3, blank: 2, files: 2, lines: 17 },
        changes: { added: 9, deleted: 4, filesChanged: 2 },
        languages: [
          { name: 'JavaScript', code: 8, comment: 2, blank: 1, files: 1 },
          { name: 'CSS', code: 4, comment: 1, blank: 1, files: 1 },
        ],
      },
    ],
  };

  const csv = formatCsv(scan);
  const [header, row] = csv.split('\r\n');

  assert.match(header, /^date,sha,short_sha,author,email,subject,code,comment,blank,total_lines,files,added,deleted,changed_files,/);
  assert.match(header, /CSS code,CSS comment,CSS blank,CSS files/);
  assert.match(header, /JavaScript code,JavaScript comment,JavaScript blank,JavaScript files/);
  assert.match(row, /"feat: add ""quoted"", commas"/);
  assert.match(row, /,12,3,2,17,2,9,4,2,/);
});
