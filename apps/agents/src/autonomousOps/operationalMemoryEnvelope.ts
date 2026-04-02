export type OperationalMemoryEnvelopeV1<TPayload extends Record<string, unknown>> = {
  schemaVersion: 1;
  asOf: string; // ISO date or timestamp
  summary: string;
  data: TPayload;
};

export function buildOperationalMemoryEnvelopeV1<TPayload extends Record<string, unknown>>(params: {
  asOf: Date;
  summary: string;
  data: TPayload;
}): OperationalMemoryEnvelopeV1<TPayload> {
  const summary = params.summary.trim();
  if (!summary) throw new Error('OP_MEMORY_SUMMARY_REQUIRED');
  return {
    schemaVersion: 1,
    asOf: params.asOf.toISOString(),
    summary,
    data: params.data,
  };
}

