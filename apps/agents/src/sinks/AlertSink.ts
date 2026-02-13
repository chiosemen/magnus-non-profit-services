import type { AlertEvent } from '../contracts/events';

export interface AlertSink {
  emit(event: AlertEvent): Promise<void>;
}

