import 'dotenv/config';
import { loadEnv } from './config/env';
import { DbAlertSink } from './sinks/DbAlertSink';
import { ConsoleAlertSink } from './sinks/ConsoleAlertSink';
import type { AgentName, ScopeType } from './contracts/run';
import { Scheduler } from './scheduler/scheduler';
import { startCron } from './scheduler/cron';
import { redactErrorMessage } from './security/redaction';
import { prisma } from './db';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function requireArg(name: string): string {
  const v = parseArg(name);
  if (!v) throw new Error(`Missing required arg: --${name}=...`);
  return v;
}

function parseScopeType(s: string): ScopeType {
  if (s === 'org' || s === 'worker' || s === 'grant') return s;
  throw new Error('Invalid --scope. Expected org|worker|grant.');
}

function parseAgentName(s: string): AgentName {
  if (s === 'ComplianceWatchdog' || s === 'WorkerIncomeOptimizer' || s === 'GrantLifecycleManager') return s;
  throw new Error('Invalid --agent. Expected ComplianceWatchdog|WorkerIncomeOptimizer|GrantLifecycleManager.');
}

async function main(): Promise<void> {
  const env = loadEnv();

  try {
    // Fail-closed: DB must be reachable at boot.
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(redactErrorMessage(err));
    process.exit(1);
  }

  const sink = env.AGENTS_ALERT_SINK === 'db' ? new DbAlertSink() : new ConsoleAlertSink();
  const scheduler = new Scheduler({ alertSink: sink });

  const mode = process.argv[2];
  if (mode === 'run:once') {
    const agentName = parseAgentName(requireArg('agent'));
    const scopeType = parseScopeType(requireArg('scope'));
    const scopeId = requireArg('id');

    // Deterministic windows anchored to each agent's schedule.
    const window = computeDefaultWindow(agentName);
    await scheduler.runAgentOnce({ agentName, scopeType, scopeId, window });
    return;
  }

  // Default: run cron scheduler.
  if (process.env['AGENTS_ENABLED'] === 'true') {
    startCron(env, scheduler);
  } else {
    // eslint-disable-next-line no-console
    console.log('Agents disabled — AGENTS_ENABLED not set');
  }
}

function computeDefaultWindow(agentName: AgentName): { start: Date; end: Date } {
  if (agentName === 'ComplianceWatchdog') return dailyWindowAt(9, 0);
  if (agentName === 'GrantLifecycleManager') return dailyWindowAt(9, 30);
  return weeklyWindowMonday0900();
}

function dailyWindowAt(hour: number, minute: number): { start: Date; end: Date } {
  const now = new Date();
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (now.getTime() < end.getTime()) end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start: new Date(end.getTime() - 24 * 60 * 60 * 1000), end };
}

function weeklyWindowMonday0900(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  end = new Date(end.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  if (now.getTime() < end.getTime()) end = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000), end };
}

main().catch(err => {
  // Fail closed with a clear error; do not print secrets.
  // eslint-disable-next-line no-console
  console.error(redactErrorMessage(err));
  process.exit(1);
});
