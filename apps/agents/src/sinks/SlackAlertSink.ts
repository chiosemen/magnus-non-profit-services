import type { AlertEvent } from '../contracts/events';
import type { AlertSink } from './AlertSink';
import { redactObject } from '../security/redaction';

export type SlackAlertSinkOptions = {
  webhookUrl: string;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export class SlackSendError extends Error {
  readonly name = 'SlackSendError';
  readonly statusCode: number;
  readonly attempts: number;

  constructor(message: string, statusCode: number, attempts: number) {
    super(message);
    this.statusCode = statusCode;
    this.attempts = attempts;
  }
}

export class SlackAlertSink implements AlertSink {
  private readonly webhookUrl: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: SlackAlertSinkOptions) {
    if (!options.webhookUrl || !options.webhookUrl.startsWith('https://hooks.slack.com/')) {
      throw new Error('SLACK_WEBHOOK_URL must be a valid Slack webhook URL');
    }
    this.webhookUrl = options.webhookUrl;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 10000;
  }

  async emit(event: AlertEvent): Promise<void> {
    const payload = this.formatSlackPayload(event);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return; // Success
        }

        // Slack returns 200 for success, other codes are errors
        const body = await response.text();
        lastError = new SlackSendError(
          `Slack webhook returned ${response.status}: ${body}`,
          response.status,
          attempt
        );

        // Don't retry on 4xx client errors (except 429 rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw lastError;
        }
      } catch (err) {
        if (err instanceof SlackSendError) {
          lastError = err;
        } else {
          lastError = new SlackSendError(
            `Slack webhook request failed: ${err instanceof Error ? err.message : String(err)}`,
            0,
            attempt
          );
        }
      }

      // Exponential backoff with jitter before retry
      if (attempt < this.maxRetries) {
        const delay = Math.min(
          this.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
          this.maxDelayMs
        );
        await this.sleep(delay);
      }
    }

    throw lastError ?? new SlackSendError('All retry attempts failed', 0, this.maxRetries);
  }

  private formatSlackPayload(event: AlertEvent): Record<string, unknown> {
    const severityEmoji = this.getSeverityEmoji(event.severity);
    const redacted = redactObject(event as unknown as Record<string, unknown>);

    return {
      text: `${severityEmoji} *${event.title}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} ${event.title}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Agent:*\n${event.agentName}` },
            { type: 'mrkdwn', text: `*Severity:*\n${event.severity}` },
            { type: 'mrkdwn', text: `*Scope:*\n${event.scopeType}` },
            { type: 'mrkdwn', text: `*Type:*\n${event.type}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: event.body,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Dedupe Key: \`${redacted['dedupeKey']}\``,
            },
          ],
        },
      ],
    };
  }

  private getSeverityEmoji(severity: AlertEvent['severity']): string {
    switch (severity) {
      case 'CRITICAL': return ':rotating_light:';
      case 'HIGH': return ':warning:';
      case 'MED': return ':large_yellow_circle:';
      case 'LOW': return ':information_source:';
      default: return ':bell:';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
