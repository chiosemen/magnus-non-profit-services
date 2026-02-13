/**
 * Magnus Grant Generator — ClaudeClient
 * Typed Anthropic SDK wrapper with retry logic, streaming, and token tracking
 */

import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  stream?: boolean;
}

export interface GenerateResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: string;
  latencyMs: number;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class ClaudeClient {
  private readonly client: Anthropic;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;
  private readonly defaultTemperature: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor() {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

    this.client = new Anthropic({ apiKey });
    this.defaultModel = process.env['ANTHROPIC_MODEL'] ?? 'claude-opus-4-5-20251101';
    this.defaultMaxTokens = parseInt(process.env['ANTHROPIC_MAX_TOKENS'] ?? '4096', 10);
    this.defaultTemperature = parseFloat(process.env['ANTHROPIC_TEMPERATURE'] ?? '0.7');
    this.maxRetries = parseInt(process.env['MAX_RETRIES'] ?? '3', 10);
    this.retryDelay = parseInt(process.env['RETRY_DELAY_MS'] ?? '1000', 10);
  }

  // ─── Core Generate ──────────────────────────────────────────────────────────

  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const start = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: options.model ?? this.defaultModel,
          max_tokens: options.maxTokens ?? this.defaultMaxTokens,
          system: options.system,
          messages: [{ role: 'user', content: prompt }],
        });

        const content = response.content
          .filter(block => block.type === 'text')
          .map(block => (block as Anthropic.TextBlock).text)
          .join('');

        return {
          content,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          model: response.model,
          stopReason: response.stop_reason ?? 'end_turn',
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    throw lastError ?? new Error('ClaudeClient: generation failed after retries');
  }

  /**
   * Generate with a conversation (system + messages)
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    const start = Date.now();

    const response = await this.client.messages.create({
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      system: options.system,
      messages,
    });

    const content = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
      stopReason: response.stop_reason ?? 'end_turn',
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Stream a response — yields delta chunks
   */
  async *stream(prompt: string, options: GenerateOptions = {}): AsyncGenerator<StreamChunk> {
    const stream = this.client.messages.stream({
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      system: options.system,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { delta: event.delta.text, done: false };
      }
      if (event.type === 'message_stop') {
        const finalMsg = await stream.finalMessage();
        yield {
          delta: '',
          done: true,
          inputTokens: finalMsg.usage.input_tokens,
          outputTokens: finalMsg.usage.output_tokens,
        };
      }
    }
  }

  /**
   * Count tokens in a prompt (uses tokenize endpoint)
   */
  async countTokens(text: string): Promise<number> {
    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if content fits within model context window
   */
  isWithinContextLimit(text: string, model?: string): boolean {
    const tokens = Math.ceil(text.length / 4);
    const limit = (model ?? this.defaultModel).includes('opus') ? 200000 : 200000;
    return tokens < limit * 0.9; // 90% of limit for safety
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let _client: ClaudeClient | null = null;
export function getClaudeClient(): ClaudeClient {
  if (!_client) _client = new ClaudeClient();
  return _client;
}

export default ClaudeClient;
