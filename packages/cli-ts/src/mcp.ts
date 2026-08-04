import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { getAdapter } from './adapters/jsonl.js';
import { buildReport } from './report.js';

const VERSION = '0.1.0';

/**
 * Starts an MCP server exposing verify/ingest/report as callable tools, so
 * an orchestrating agent can invoke PaceProof programmatically as part of
 * its own audit workflow. Every tool handler here is a thin wrapper around
 * the exact same aggregator/report logic the CLI commands call -- there is
 * no separate reimplementation for the MCP path.
 */
export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: 'paceproof', version: VERSION });

  server.registerTool(
    'verify',
    {
      title: 'Verify attestation records',
      description:
        'Verify Ed25519 signatures on every attestation record found at a path. Returns verified/unverified ' +
        'counts and, for each unverified record, the reason it failed.',
      inputSchema: {
        path: z.string().describe('File or directory of records to verify'),
        adapter: z.string().optional().describe('Adapter name to use for reading input (default: jsonl)'),
      },
    },
    async ({ path, adapter }) => {
      const records = await getAdapter(adapter ?? 'jsonl').read(path);
      const report = buildReport(path, records);
      const payload = {
        source: report.source,
        verified_count: report.summary.verified_count,
        unverified_count: report.summary.unverified_count,
        unverified_reasons: report.summary.unverified_reasons,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.registerTool(
    'ingest',
    {
      title: 'Ingest records',
      description:
        'Run a named adapter over a file, directory, or URL and return normalized canonical-schema records. ' +
        'A URL input performs a network fetch -- this is the only tool that ever makes a network call.',
      inputSchema: {
        path: z.string().describe('File, directory, or URL to ingest'),
        adapter: z.string().optional().describe('Adapter name to use (default: jsonl)'),
        out: z.string().optional().describe('If set, write JSONL output to this file instead of returning it inline'),
      },
    },
    async ({ path, adapter, out }) => {
      const records = await getAdapter(adapter ?? 'jsonl').read(path);
      const jsonl = records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
      if (out) {
        writeFileSync(out, jsonl, 'utf-8');
        return { content: [{ type: 'text', text: `Wrote ${records.length} record(s) to ${out}` }] };
      }
      return { content: [{ type: 'text', text: jsonl || '(no records found)' }] };
    },
  );

  server.registerTool(
    'report',
    {
      title: 'Build an attestation report',
      description:
        'Ingest and verify records at a path, then aggregate into a full report: totals by provider, by ' +
        'workload_type, and verified vs. unverified counts and compute totals, always kept separate.',
      inputSchema: {
        path: z.string().describe('File or directory to report on'),
        adapter: z.string().optional().describe('Adapter name to use for reading input (default: jsonl)'),
      },
    },
    async ({ path, adapter }) => {
      const records = await getAdapter(adapter ?? 'jsonl').read(path);
      const report = buildReport(path, records);
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
