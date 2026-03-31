import cron from 'node-cron';
import type { AgentsEnv } from '../config/env';
import { Scheduler } from './scheduler';

export function startCron(env: AgentsEnv, scheduler: Scheduler): void {
  const tz = env.AGENTS_TIMEZONE;

  // Daily 09:00 local time
  cron.schedule('0 9 * * *', () => {
    const window = dailyWindowAtLocalHour(9, 0);
    scheduler.runScheduled('ComplianceWatchdog', window).catch(() => {
      // Fail closed: scheduler process should exit on cron failure to avoid silent drift.
      process.exit(1);
    });
  }, tz ? { timezone: tz } : undefined);

  // Daily 09:30 local time
  cron.schedule('30 9 * * *', () => {
    const window = dailyWindowAtLocalHour(9, 30);
    scheduler.runScheduled('GrantLifecycleManager', window).catch(() => {
      process.exit(1);
    });
  }, tz ? { timezone: tz } : undefined);

  // Daily 10:00 local time — financial watch (grant pace; internal alerts only)
  cron.schedule('0 10 * * *', () => {
    const window = dailyWindowAtLocalHour(10, 0);
    scheduler.runScheduled('FinancialSentinel', window).catch(() => {
      process.exit(1);
    });
  }, tz ? { timezone: tz } : undefined);

  // Weekly Monday 08:00 local time — board / executive prep digest
  cron.schedule('0 8 * * 1', () => {
    const window = weeklyWindowMondayAt(8, 0);
    scheduler.runScheduled('BoardIntelligenceOracle', window).catch(() => {
      process.exit(1);
    });
  }, tz ? { timezone: tz } : undefined);

  // Weekly Monday 09:00 local time
  cron.schedule('0 9 * * 1', () => {
    const window = weeklyWindowMondayAt(9, 0);
    scheduler.runScheduled('WorkerIncomeOptimizer', window).catch(() => {
      process.exit(1);
    });
  }, tz ? { timezone: tz } : undefined);
}

function dailyWindowAtLocalHour(hour: number, minute: number): { start: Date; end: Date } {
  const now = new Date();
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (now.getTime() < end.getTime()) {
    end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  }
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

function weeklyWindowMondayAt(hour: number, minute: number): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  end = new Date(end.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  if (now.getTime() < end.getTime()) {
    end = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}
