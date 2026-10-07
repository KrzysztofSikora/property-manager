// Claude Code PostToolUse hook: formats and lints the file an Edit/Write just touched.
// Advisory: lint errors go to stderr with exit 2 so Claude sees them; the edit already happened.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');

function filePathFromStdin(): string | undefined {
  try {
    const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
    if (typeof input !== 'object' || input === null || !('tool_input' in input)) return undefined;
    const toolInput: unknown = input.tool_input;
    if (typeof toolInput !== 'object' || toolInput === null || !('file_path' in toolInput)) {
      return undefined;
    }
    return typeof toolInput.file_path === 'string' ? toolInput.file_path : undefined;
  } catch {
    return undefined;
  }
}

const filePath = filePathFromStdin();
if (filePath === undefined) process.exit(0);

const rel = relative(root, filePath);
if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) process.exit(0);

const bin = (name: string) => join(root, 'node_modules/.bin', name);

spawnSync(bin('prettier'), ['--write', '--ignore-unknown', '--log-level', 'warn', rel], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});

const lint = spawnSync(bin('eslint'), ['--no-warn-ignored', rel], {
  cwd: root,
  encoding: 'utf8',
});
if (lint.status !== 0) {
  process.stderr.write(`ESLint (${rel}):\n${lint.stdout}${lint.stderr}`);
  process.exit(2);
}
