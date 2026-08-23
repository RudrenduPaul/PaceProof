import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { getAdapter } from './adapters/jsonl.js';
import { buildReport, renderHumanReadable } from './report.js';
import { renderDashboardHtml } from './dashboard.js';
import { scaffoldExample } from './init.js';
import { startMcpServer } from './mcp.js';
import type { RawRecord } from './types.js';
import { VERSION } from './version.js';

async function readRecordsFromPath(input: string, adapterName: string): Promise<RawRecord[]> {
  const adapter = getAdapter(adapterName);
  return adapter.read(input);
}

export function buildCli(): Command {
  const program = new Command();
  program
    .name('paceproof')
    .description(
      'Verify Ed25519-signed compute-attestation records and report what compute was actually run, ' +
        'by whom, and whether every signature checks out. PaceProof only reads and verifies already-signed ' +
        'records -- it does not sign or generate attestations.',
    )
    .version(VERSION);

  program
    .command('init')
    .description('Scaffold an example directory with a sample keypair and validly/invalidly signed example records')
    .argument('[path]', 'directory to create', './paceproof-example')
    .action((path: string) => {
      try {
        const result = scaffoldExample(path);
        process.stdout.write(`Created example data at ${result.targetDir}\n`);
        process.stdout.write(`  ${result.keypairFile}\n`);
        process.stdout.write(`  ${result.recordsFile}\n`);
        process.stdout.write(`  ${result.readmeFile}\n`);
        process.stdout.write(`\nTry: paceproof report ${result.targetDir}\n`);
      } catch (err) {
        process.stderr.write(`paceproof init: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('verify')
    .description('Verify Ed25519 signatures on every record found at <path>')
    .argument('<path>', 'file, directory of .jsonl files, to verify')
    .option('--json', 'output structured JSON instead of a human-readable table')
    .option('--adapter <name>', 'adapter to use for reading input', 'jsonl')
    .action(async (path: string, opts: { json?: boolean; adapter: string }) => {
      try {
        const records = await readRecordsFromPath(path, opts.adapter);
        const report = buildReport(path, records);
        if (opts.json) {
          process.stdout.write(
            JSON.stringify(
              {
                source: report.source,
                verified_count: report.summary.verified_count,
                unverified_count: report.summary.unverified_count,
                unverified_reasons: report.summary.unverified_reasons,
              },
              null,
              2,
            ) + '\n',
          );
        } else {
          process.stdout.write(`Verified: ${report.summary.verified_count}\n`);
          process.stdout.write(`Unverified: ${report.summary.unverified_count}\n`);
          for (const { record_id, reason } of report.summary.unverified_reasons) {
            process.stdout.write(`  FAIL ${record_id ?? '(no record_id)'}: ${reason}\n`);
          }
        }
        if (report.summary.unverified_count > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        process.stderr.write(`paceproof verify: ${(err as Error).message}\n`);
        process.exitCode = 2;
      }
    });

  program
    .command('ingest')
    .description('Run a named adapter over the input and emit normalized canonical-schema records as JSONL')
    .argument('<path-or-url>', 'file, directory, or URL to ingest')
    .option('--adapter <name>', 'adapter to use', 'jsonl')
    .option('--out <file>', 'write JSONL output to a file instead of stdout')
    .action(async (input: string, opts: { adapter: string; out?: string }) => {
      try {
        const records = await readRecordsFromPath(input, opts.adapter);
        const jsonl = records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
        if (opts.out) {
          writeFileSync(opts.out, jsonl, 'utf-8');
          process.stdout.write(`Wrote ${records.length} record(s) to ${opts.out}\n`);
        } else {
          process.stdout.write(jsonl);
        }
      } catch (err) {
        process.stderr.write(`paceproof ingest: ${(err as Error).message}\n`);
        process.exitCode = 2;
      }
    });

  program
    .command('report')
    .description('Ingest and verify records at <path>, then aggregate into a summary report')
    .argument('<path>', 'file or directory to report on')
    .option('--json', 'output structured JSON instead of a human-readable table')
    .option('--adapter <name>', 'adapter to use for reading input', 'jsonl')
    .action(async (path: string, opts: { json?: boolean; adapter: string }) => {
      try {
        const records = await readRecordsFromPath(path, opts.adapter);
        const report = buildReport(path, records);
        if (opts.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        } else {
          process.stdout.write(renderHumanReadable(report) + '\n');
        }
      } catch (err) {
        process.stderr.write(`paceproof report: ${(err as Error).message}\n`);
        process.exitCode = 2;
      }
    });

  program
    .command('dashboard')
    .description('Render a single self-contained static HTML dashboard from a report')
    .argument('<path>', 'file or directory to report on')
    .option('--out <file>', 'output HTML file path', 'paceproof-dashboard.html')
    .option('--adapter <name>', 'adapter to use for reading input', 'jsonl')
    .action(async (path: string, opts: { out: string; adapter: string }) => {
      try {
        const records = await readRecordsFromPath(path, opts.adapter);
        const report = buildReport(path, records);
        const html = renderDashboardHtml(report);
        writeFileSync(opts.out, html, 'utf-8');
        process.stdout.write(`Wrote dashboard to ${opts.out}\n`);
      } catch (err) {
        process.stderr.write(`paceproof dashboard: ${(err as Error).message}\n`);
        process.exitCode = 2;
      }
    });

  program
    .command('mcp')
    .description('Start an MCP server exposing verify/ingest/report as callable tools')
    .action(async () => {
      await startMcpServer();
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = buildCli();
  await program.parseAsync(argv);
}
