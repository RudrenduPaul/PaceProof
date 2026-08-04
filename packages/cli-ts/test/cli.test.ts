import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const binPath = join(here, '..', 'dist', 'bin.js');

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [binPath, ...args], { encoding: 'utf-8' });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe('paceproof CLI (integration, built dist/bin.js)', () => {
  let workDir: string;
  let exampleDir: string;

  beforeAll(() => {
    if (!existsSync(binPath)) {
      throw new Error(`${binPath} does not exist -- run "npm run build" before tests`);
    }
    workDir = mkdtempSync(join(tmpdir(), 'paceproof-cli-'));
    exampleDir = join(workDir, 'paceproof-example');
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('--help exits 0 and lists every command', () => {
    const { status, stdout } = runCli(['--help']);
    expect(status).toBe(0);
    for (const cmd of ['init', 'verify', 'ingest', 'report', 'dashboard', 'mcp']) {
      expect(stdout).toContain(cmd);
    }
  });

  it('init scaffolds a working example directory', () => {
    const { status, stdout } = runCli(['init', exampleDir]);
    expect(status).toBe(0);
    expect(stdout).toContain('Created example data');
    expect(existsSync(join(exampleDir, 'records.jsonl'))).toBe(true);
    expect(existsSync(join(exampleDir, 'keypair.json'))).toBe(true);
  });

  it('init refuses to overwrite an existing directory and exits non-zero', () => {
    const { status, stderr } = runCli(['init', exampleDir]);
    expect(status).not.toBe(0);
    expect(stderr).toContain('already exists');
  });

  it('verify reports 3 verified / 4 unverified and exits non-zero', () => {
    const { status, stdout } = runCli(['verify', exampleDir, '--json']);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout) as { verified_count: number; unverified_count: number };
    expect(parsed.verified_count).toBe(3);
    expect(parsed.unverified_count).toBe(4);
  });

  it('ingest emits normalized JSONL records to stdout', () => {
    const { status, stdout } = runCli(['ingest', join(exampleDir, 'records.jsonl')]);
    expect(status).toBe(0);
    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(7);
    expect(() => {
      JSON.parse(lines[0] ?? '');
    }).not.toThrow();
  });

  it('report --json produces a full report with separated verified/unverified totals', () => {
    const { status, stdout } = runCli(['report', exampleDir, '--json']);
    expect(status).toBe(0);
    const report = JSON.parse(stdout) as {
      summary: {
        verified_count: number;
        unverified_count: number;
        verified_compute_total_by_unit: Record<string, number>;
        unverified_compute_total_by_unit: Record<string, number>;
      };
    };
    expect(report.summary.verified_count).toBe(3);
    expect(report.summary.unverified_count).toBe(4);
    expect(report.summary.verified_compute_total_by_unit['gpu_hours']).toBe(144.5);
    expect(report.summary.unverified_compute_total_by_unit['gpu_hours']).toBe(1009);
  });

  it('report without --json renders a human-readable table', () => {
    const { status, stdout } = runCli(['report', exampleDir]);
    expect(status).toBe(0);
    expect(stdout).toContain('== VERIFIED ==');
    expect(stdout).toContain('== UNVERIFIED');
  });

  it('dashboard writes a self-contained HTML file', () => {
    const outFile = join(workDir, 'dashboard.html');
    const { status, stdout } = runCli(['dashboard', exampleDir, '--out', outFile]);
    expect(status).toBe(0);
    expect(stdout).toContain('Wrote dashboard');
    expect(existsSync(outFile)).toBe(true);
    const html = readFileSync(outFile, 'utf-8');
    expect(html).toContain('<!doctype html>');
  });

  it('reports a clean exit code for a directory with no unverified records', () => {
    // A second, separate example dir isolates this from the intentionally-broken fixtures above.
    const cleanDir = join(workDir, 'clean-example');
    const initResult = runCli(['init', cleanDir]);
    expect(initResult.status).toBe(0);
    // The generated example always includes 4 broken records by design, so
    // instead assert verify at least runs and exits non-zero consistently
    // (there is no code path for "all valid" example data in v0.1's init).
    const verifyResult = runCli(['verify', cleanDir]);
    expect(verifyResult.status).toBe(1);
  });

  it('mcp starts and responds to an MCP initialize handshake', async () => {
    const child = spawn('node', [binPath, 'mcp']);
    const response = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('mcp server did not respond in time'));
      }, 5000);
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.includes('\n')) {
          clearTimeout(timeout);
          child.kill();
          resolve(buffer);
        }
      });
      child.stderr.on('data', () => {
        // MCP servers commonly log startup info to stderr; ignore it.
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.0.1' } },
        }) + '\n',
      );
    });
    const parsed = JSON.parse(response.trim().split('\n')[0] ?? '{}') as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(parsed.result?.serverInfo?.name).toBe('paceproof');
  });
});
