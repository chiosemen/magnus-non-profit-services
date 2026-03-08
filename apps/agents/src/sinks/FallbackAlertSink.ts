import type { AlertEvent } from '../contracts/events';
import type { AlertSink } from './AlertSink';
import { redactObject } from '../security/redaction';

export type SinkFailure = {
  sinkName: string;
  error: string;
  timestamp: string;
};

export type FallbackResult = {
  success: boolean;
  usedSink: string;
  failures: SinkFailure[];
};

export class FallbackAlertSink implements AlertSink {
  private readonly sinks: Array<{ name: string; sink: AlertSink }>;
  private readonly onFailure?: (event: AlertEvent, failures: SinkFailure[]) => void;

  constructor(
    sinks: Array<{ name: string; sink: AlertSink }>,
    options?: { onFailure?: (event: AlertEvent, failures: SinkFailure[]) => void }
  ) {
    if (sinks.length === 0) {
      throw new Error('FallbackAlertSink requires at least one sink');
    }
    this.sinks = sinks;
    this.onFailure = options?.onFailure;
  }

  async emit(event: AlertEvent): Promise<void> {
    const result = await this.emitWithResult(event);
    if (!result.success) {
      // All sinks failed - call failure handler and throw
      if (this.onFailure) {
        this.onFailure(event, result.failures);
      }
      throw new Error(`All alert sinks failed: ${result.failures.map(f => f.sinkName).join(', ')}`);
    }
  }

  async emitWithResult(event: AlertEvent): Promise<FallbackResult> {
    const failures: SinkFailure[] = [];

    for (const { name, sink } of this.sinks) {
      try {
        await sink.emit(event);
        // Log partial failures even on success
        if (failures.length > 0 && this.onFailure) {
          this.onFailure(event, failures);
        }
        return { success: true, usedSink: name, failures };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        failures.push({
          sinkName: name,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return { success: false, usedSink: '', failures };
  }

  getSinkNames(): string[] {
    return this.sinks.map(s => s.name);
  }
}

// Structured failure logger for production use
export function createStructuredFailureLogger(): (event: AlertEvent, failures: SinkFailure[]) => void {
  return (event: AlertEvent, failures: SinkFailure[]) => {
    const redacted = redactObject(event as unknown as Record<string, unknown>);
    const logEntry = {
      level: 'error',
      message: 'Alert sink failures',
      alertType: event.type,
      alertSeverity: event.severity,
      agentName: event.agentName,
      scopeType: event.scopeType,
      dedupeKey: redacted['dedupeKey'],
      failures: failures.map(f => ({
        sink: f.sinkName,
        error: f.error,
        timestamp: f.timestamp,
      })),
      timestamp: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(logEntry));
  };
}
