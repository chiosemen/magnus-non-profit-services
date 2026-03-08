import 'dotenv/config';
import { validateEnv } from '@magnus/config/envValidator';
import { loadEnv, type AlertSinkType, type AgentsEnv } from './config/env';
import type { AlertSink } from './sinks/AlertSink';
import { DbAlertSink } from './sinks/DbAlertSink';
import { ConsoleAlertSink } from './sinks/ConsoleAlertSink';
import { SlackAlertSink } from './sinks/SlackAlertSink';
import { FallbackAlertSink, createStructuredFailureLogger } from './sinks/FallbackAlertSink';
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

function createAlertSink(env: AgentsEnv): AlertSink {
  const sinkType = env.AGENTS_ALERT_SINK;

  if (sinkType === 'console') {
    return new ConsoleAlertSink();
  }

  if (sinkType === 'db') {
    return new DbAlertSink();
  }

  if (sinkType === 'slack') {
    return new SlackAlertSink({
      webhookUrl: env.SLACK_WEBHOOK_URL!,
      maxRetries: env.SLACK_MAX_RETRIES,
    });
  }

  // fallback: Slack -> DB -> Console (dev only)
  const failureLogger = createStructuredFailureLogger();
  const sinks: Array<{ name: string; sink: AlertSink }> = [
    {
      name: 'slack',
      sink: new SlackAlertSink({
        webhookUrl: env.SLACK_WEBHOOK_URL!,
        maxRetries: env.SLACK_MAX_RETRIES,
      }),
    },
    { name: 'db', sink: new DbAlertSink() },
  ];

  // Only add console as last resort in non-production
  if (env.NODE_ENV !== 'production') {
    sinks.push({ name: 'console', sink: new ConsoleAlertSink() });
  }

  return new FallbackAlertSink(sinks, { onFailure: failureLogger });
}

function parseAgentName(s: string): AgentName {
  if (s === 'ComplianceWatchdog' || s === 'WorkerIncomeOptimizer' || s === 'GrantLifecycleManager') return s;
  throw new Error('Invalid --agent. Expected ComplianceWatchdog|WorkerIncomeOptimizer|GrantLifecycleManager.');
}

async function main(): Promise<void> {
  validateEnv('agents');
  const env = loadEnv();

  try {
    // Fail-closed: DB must be reachable at boot.
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(redactErrorMessage(err));
    process.exit(1);
  }

  const sink = createAlertSink(env);
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
