export type Leak = { file: string; line: number; kind: 'key' | 'access_key' };

// A key-like value: 16+ alphanumerics. Redaction markers, a bare `access_key=` and the
// `TEST_WEATHERSTACK_KEY` sentinel don't match.
const ACCESS_KEY_PATTERN = /access_key=[A-Za-z0-9]{16,}/;
const MIN_KEY_LENGTH = 8;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Scans the added lines of a unified diff (`git diff -U0`) for the key or a key-like value. */
export function findSecretLeaks(diff: string, key: string | undefined): Leak[] {
  const literalKey = key !== undefined && key.length >= MIN_KEY_LENGTH ? key : undefined;
  const leaks: Leak[] = [];
  let file = '';
  let line = 0;

  for (const text of diff.split('\n')) {
    if (text.startsWith('+++ ')) {
      file = text.replace(/^\+\+\+ (b\/)?/, '');
      continue;
    }
    const hunk = HUNK_HEADER.exec(text);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (text.startsWith('+')) {
      const added = text.slice(1);
      if (literalKey !== undefined && added.includes(literalKey)) {
        leaks.push({ file, line, kind: 'key' });
      } else if (ACCESS_KEY_PATTERN.test(added)) {
        leaks.push({ file, line, kind: 'access_key' });
      }
      line += 1;
    } else if (text.startsWith(' ')) {
      line += 1;
    }
  }
  return leaks;
}

/** One `file:line kind` per leak. Never includes the matched text. */
export function formatLeaks(leaks: readonly Leak[]): string {
  return leaks.map((leak) => `${leak.file}:${String(leak.line)} ${leak.kind}`).join('\n');
}
