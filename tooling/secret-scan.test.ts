import { describe, expect, it } from 'vitest';
import { findSecretLeaks, formatLeaks } from './secret-scan.ts';

// Key-like values are built at runtime so no committed file matches the rule itself.
const KEY = ['0123abcd', '4567ef01', '89abcdef', '01234567'].join('');
const ACCESS = 'access' + '_key=';

function diff(file: string, ...lines: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,0 +1,2 @@',
    ...lines,
  ].join('\n');
}

describe('findSecretLeaks', () => {
  it('flags an added line containing the literal key', () => {
    const leaks = findSecretLeaks(diff('src/a.ts', '+const k = 1;', `+const url = "${KEY}";`), KEY);

    expect(leaks).toEqual([{ file: 'src/a.ts', line: 2, kind: 'key' }]);
  });

  it('tracks the file and line across hunks and files', () => {
    const input = [
      diff('a.ts', '+ok'),
      '@@ -10,0 +20,1 @@',
      `+${KEY}`,
      diff('b.ts', `+x ${ACCESS}${'b'.repeat(16)}`),
    ].join('\n');

    expect(findSecretLeaks(input, KEY)).toEqual([
      { file: 'a.ts', line: 20, kind: 'key' },
      { file: 'b.ts', line: 1, kind: 'access_key' },
    ]);
  });

  it('ignores removed and context lines', () => {
    const input = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,1 @@',
      `-${KEY}`,
      ` ${ACCESS}${'c'.repeat(32)}`,
      '+clean',
    ].join('\n');

    expect(findSecretLeaks(input, KEY)).toEqual([]);
  });

  it('does not treat the +++ header as an added line', () => {
    const file = `${ACCESS}${'d'.repeat(20)}.txt`;

    expect(findSecretLeaks(diff(file, '+clean'), undefined)).toEqual([]);
  });

  it('scans an added line whose content starts with "++ " (shown as "+++ " in the hunk)', () => {
    const leaks = findSecretLeaks(
      diff('a.md', '+ok', `+++ ${ACCESS}${'f'.repeat(32)}`, '+after'),
      undefined,
    );

    expect(leaks).toEqual([{ file: 'a.md', line: 2, kind: 'access_key' }]);
  });

  it.each([
    ['a 16-char value', `${ACCESS}${'e'.repeat(16)}`, true],
    ['a 32-char hex value', `${ACCESS}${KEY}`, true],
    ['a 15-char value', `${ACCESS}${'e'.repeat(15)}`, false],
    ['[REDACTED]', `${ACCESS}[REDACTED]`, false],
    ['the URL-encoded redaction', `${ACCESS}%5BREDACTED%5D`, false],
    ['a bare access_key=', ACCESS, false],
    ['the test sentinel', `${ACCESS}TEST_WEATHERSTACK_KEY`, false],
  ])('access_key with %s → flagged: %s', (_name, line, flagged) => {
    const leaks = findSecretLeaks(diff('a.md', `+${line}`), undefined);

    expect(leaks.length > 0).toBe(flagged);
  });

  it('ignores the literal-key check for an unset or short key', () => {
    expect(findSecretLeaks(diff('a.ts', '+short'), 'short')).toEqual([]);
    expect(findSecretLeaks(diff('a.ts', '+short'), '')).toEqual([]);
  });
});

describe('formatLeaks', () => {
  it('prints file:line kind and never the matched text', () => {
    const leaks = findSecretLeaks(diff('src/a.ts', `+${KEY}`, `+${ACCESS}${KEY}`), KEY);
    const output = formatLeaks(leaks);

    expect(output).toBe('src/a.ts:1 key\nsrc/a.ts:2 key');
    expect(output).not.toContain(KEY);
  });
});
