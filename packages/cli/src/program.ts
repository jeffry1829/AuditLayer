import { Command, Option } from 'commander';

import { exportCommand, initCommand, queryCommand, verifyCommand } from './commands.js';
import { loadConfig, resolveConfig, type ConfigOverrides } from './config.js';

export interface RunOptions {
  argv?: string[];
  cwd?: string;
  exitOverride?: boolean;
}

export function buildProgram(runOpts: RunOptions = {}): Command {
  const program = new Command();
  program
    .name('auditlayer')
    .description(
      'AuditLayer CLI — query, verify, and export hash-chained audit logs for EU AI Act Article 12.',
    )
    .version('0.1.0', '-v, --version')
    .addOption(new Option('--config <path>', 'config file path'))
    .addOption(new Option('--system-id <id>', 'override config systemId'))
    .addOption(new Option('--storage-dir <dir>', 'override local storage directory'))
    .addOption(new Option('--s3-bucket <bucket>', 'override S3 bucket'))
    .addOption(new Option('--s3-region <region>', 'override S3 region'))
    .addOption(new Option('--s3-prefix <prefix>', 'override S3 key prefix'))
    .addOption(new Option('--json', 'emit machine-readable JSON').default(false));

  if (runOpts.exitOverride) program.exitOverride();

  const cwd = runOpts.cwd ?? process.cwd();

  program
    .command('init')
    .description('Write a starter auditlayer.config.json')
    .option('--output <path>', 'output path', 'auditlayer.config.json')
    .option('--force', 'overwrite existing file', false)
    .action(async (opts: { output: string; force: boolean }) => {
      const code = await initCommand(
        { output: opts.output, force: opts.force },
        { stdout: process.stdout, stderr: process.stderr, cwd },
      );
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('query')
    .description('Retrieve all entries for a case')
    .requiredOption('--case-id <id>', 'case identifier')
    .option('--from <iso>', 'inclusive lower bound (ISO-8601 UTC)')
    .option('--to <iso>', 'inclusive upper bound (ISO-8601 UTC)')
    .action(async (opts: { caseId: string; from?: string; to?: string }) => {
      const { json, ...rest } = collectGlobals(program.opts());
      const config = resolveConfig(await loadConfig(rest.config), rest);
      const code = await queryCommand(
        config,
        { ...opts, json },
        { stdout: process.stdout, stderr: process.stderr, cwd },
      );
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('verify')
    .description('Verify the hash chain over the configured range')
    .option('--from <iso>', 'inclusive lower bound (ISO-8601 UTC)')
    .option('--to <iso>', 'inclusive upper bound (ISO-8601 UTC)')
    .option('--case-id <id>', 'limit verification to a single case')
    .action(async (opts: { from?: string; to?: string; caseId?: string }) => {
      const { json, ...rest } = collectGlobals(program.opts());
      const config = resolveConfig(await loadConfig(rest.config), rest);
      const code = await verifyCommand(
        config,
        { ...opts, json },
        { stdout: process.stdout, stderr: process.stderr, cwd },
      );
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('export')
    .description('Export an evidence bundle to JSONL')
    .option('--case-id <id>', 'case identifier')
    .option('--from <iso>', 'inclusive lower bound (ISO-8601 UTC)')
    .option('--to <iso>', 'inclusive upper bound (ISO-8601 UTC)')
    .option('--output <path>', 'output file path (defaults to stdout)')
    .action(async (opts: { caseId?: string; from?: string; to?: string; output?: string }) => {
      const { json: _json, ...rest } = collectGlobals(program.opts());
      void _json;
      const config = resolveConfig(await loadConfig(rest.config), rest);
      const code = await exportCommand(config, opts, {
        stdout: process.stdout,
        stderr: process.stderr,
        cwd,
      });
      if (code !== 0) process.exitCode = code;
    });

  return program;
}

function collectGlobals(opts: Record<string, unknown>): ConfigOverrides & {
  config?: string;
  json: boolean;
} {
  return {
    config: (opts['config'] as string | undefined) ?? undefined,
    systemId: (opts['systemId'] as string | undefined) ?? undefined,
    storageDir: (opts['storageDir'] as string | undefined) ?? undefined,
    s3Bucket: (opts['s3Bucket'] as string | undefined) ?? undefined,
    s3Region: (opts['s3Region'] as string | undefined) ?? undefined,
    s3Prefix: (opts['s3Prefix'] as string | undefined) ?? undefined,
    json: Boolean(opts['json']),
  };
}

export async function runCli(opts: RunOptions = {}): Promise<number> {
  const program = buildProgram(opts);
  try {
    await program.parseAsync(opts.argv ?? process.argv);
    const code = process.exitCode;
    return typeof code === 'number' ? code : 0;
  } catch (err) {
    process.stderr.write(`auditlayer: ${(err as Error).message}\n`);
    return 1;
  }
}
