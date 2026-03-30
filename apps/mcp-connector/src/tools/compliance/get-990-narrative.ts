import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import {
  Form990NarrativeIntelligenceService,
  Form990NarrativeRequestSchema,
  type Form990NarrativeRequest,
} from '@magnus/reports';

const get990NarrativeSchema = z.object({
  /**
   * For tenancy validation: mcp-connector server.ts will validate org ownership
   * when `ein` appears in tool input.
   */
  ein: z.string().min(9).describe('EIN of the nonprofit (must belong to authenticated org)'),
  org: Form990NarrativeRequestSchema.shape.org,
  programs: Form990NarrativeRequestSchema.shape.programs,
  constraints: Form990NarrativeRequestSchema.shape.constraints.optional(),
  evidencePolicy: Form990NarrativeRequestSchema.shape.evidencePolicy.optional(),
}).strict();

export type Get990NarrativeInput = z.infer<typeof get990NarrativeSchema>;

function getAnthropicApiKey(): string {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key || key.trim().length < 10) {
    throw new Error('ANTHROPIC_API_KEY_REQUIRED');
  }
  return key;
}

async function generateWithClaude(prompt: string): Promise<{ text: string }> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });
  const res = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1400,
    temperature: 0,
    system:
      'You must follow grounding rules. Output must be strict JSON only. If you cannot comply, refuse.',
    messages: [{ role: 'user', content: prompt }],
  });

  const first = Array.isArray(res.content) ? res.content[0] : null;
  const text = first && first.type === 'text' ? first.text : '';
  return { text };
}

export async function execute(input: Get990NarrativeInput): Promise<string> {
  const parsed = get990NarrativeSchema.parse(input);

  const request: Form990NarrativeRequest = {
    org: parsed.org,
    programs: parsed.programs,
    ...(parsed.constraints ? { constraints: parsed.constraints } : {}),
    ...(parsed.evidencePolicy ? { evidencePolicy: parsed.evidencePolicy } : {}),
  };

  const service = new Form990NarrativeIntelligenceService();
  const result = await service.generate({
    input: request,
    llm: generateWithClaude,
  });

  return JSON.stringify(
    {
      ein: parsed.ein,
      ...result,
    },
    null,
    2,
  );
}

export default {
  name: 'get-990-narrative',
  schema: get990NarrativeSchema,
  execute,
};

