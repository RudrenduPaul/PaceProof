import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveSafeOutputPath } from '../src/mcp.js';

describe('resolveSafeOutputPath', () => {
  const cwd = '/home/user/paceproof-data';

  it('allows a plain relative filename', () => {
    expect(resolveSafeOutputPath('report.jsonl', cwd)).toBe(join(cwd, 'report.jsonl'));
  });

  it('allows a relative path into a subdirectory', () => {
    expect(resolveSafeOutputPath('out/report.jsonl', cwd)).toBe(join(cwd, 'out', 'report.jsonl'));
  });

  it('rejects an absolute path (e.g. overwriting an arbitrary system file)', () => {
    expect(() => resolveSafeOutputPath('/etc/passwd', cwd)).toThrow(/absolute/);
    expect(() => resolveSafeOutputPath('/Users/victim/.ssh/authorized_keys', cwd)).toThrow(/absolute/);
  });

  it('rejects a "../" traversal that escapes the working directory', () => {
    expect(() => resolveSafeOutputPath('../../etc/passwd', cwd)).toThrow(/outside the current working directory/);
    expect(() => resolveSafeOutputPath('../sibling-project/README.md', cwd)).toThrow(
      /outside the current working directory/,
    );
  });

  it('allows a "../" that stays within the working directory after normalization', () => {
    expect(resolveSafeOutputPath('sub/../report.jsonl', cwd)).toBe(join(cwd, 'report.jsonl'));
  });
});
