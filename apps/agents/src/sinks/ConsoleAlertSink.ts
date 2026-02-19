import type { AlertEvent } from '../contracts/events';
import type { AlertSink } from './AlertSink';
import { redactObject } from '../security/redaction';

export class ConsoleAlertSink implements AlertSink {
  async emit(event: AlertEvent): Promise<void> {
    // Dev-only sink; never default in production (enforced in env loader).
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(redactObject(event as unknown as Record<string, unknown>)));
  }
}

