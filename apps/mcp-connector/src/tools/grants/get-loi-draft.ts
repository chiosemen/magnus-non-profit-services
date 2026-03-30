import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { LoiGeneratorService, LoiRequestSchema, type LoiRequest } from '@magnus/grants';

const getLoiDraftSchema = z.object({
  /**
   * Optional: used only for consistency with other tools; LOI generation is
   * grounded to provided org/program facts and does not fetch external data.
   */
  org_ein: z.string().min(9).optional(),
  input: LoiRequestSchema,
}).strict();

export type GetLoiDraftInput = z.infer<typeof getLoiDraftSchema>;

function requireAnthropicKey(): string {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key || key.trim().length < 10) throw new Error('ANTHROPIC_API_KEY_REQUIRED');
  return key;
}

async function generateWithClaude(prompt: string): Promise<{ text: string }> {
  const client = new Anthropic({ apiKey: requireAnthropicKey() });
  const res = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1600,
    temperature: 0,
    system: 'You must follow grounding rules. Output must be strict JSON only. If you cannot comply, refuse.',
    messages: [{ role: 'user', content: prompt }],
  });
  const first = Array.isArray(res.content) ? res.content[0] : null;
  const text = first && first.type === 'text' ? first.text : '';
  return { text };
}

export async function execute(input: GetLoiDraftInput): Promise<string> {
  const parsed = getLoiDraftSchema.parse(input);
  const request: LoiRequest = parsed.input;

  const service = new LoiGeneratorService();
  const result = await service.generate({ input: request, llm: generateWithClaude });

  return JSON.stringify(
    {
      ...(parsed.org_ein ? { org_ein: parsed.org_ein } : {}),
      ...result,
    },
    null,
    2,
  );
}

export default {
  name: 'get-loi-draft',
  schema: getLoiDraftSchema,
  execute,
};

