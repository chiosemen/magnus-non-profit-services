import { describe, expect, it } from 'vitest';
import {
  Form990NarrativeIntelligenceService,
  type Form990NarrativeRequest,
} from '@magnus/reports';

function baseInput(): Form990NarrativeRequest {
  return {
    org: {
      ein: '123456789',
      orgName: 'Magnus Test Org',
      missionStatement: 'We provide community services with accountable reporting.',
    },
    programs: [
      {
        name: 'Food Support Program',
        timePeriod: { startDate: '2025-01-01', endDate: '2025-12-31' },
        whatWeDo:
          'We operate weekly food distribution events and coordinate home delivery for seniors who cannot travel, using volunteers and local partners to source and pack food.',
        whoWeServe:
          'Low-income families and seniors in our service area who face food insecurity.',
        outputs: [{ label: 'Food boxes distributed', value: 1200, unit: 'boxes' }],
      },
    ],
    constraints: { tone: 'formal', maxChars: 1800 },
    evidencePolicy: { requireEvidenceForOutcomes: true, minWhatWeDoChars: 80, minOutputMetricsPerProgram: 0 },
  };
}

describe('Form990NarrativeIntelligenceService', () => {
  it('supported generation path returns narrative + traceability', async () => {
    const service = new Form990NarrativeIntelligenceService();

    const llm = async (_prompt: string) => ({
      text: JSON.stringify({
        program_narratives: [
          {
            program_name: 'Food Support Program',
            narrative:
              'During the period, the organization operated weekly food distributions and coordinated home delivery for seniors who could not travel. The program served low-income families and seniors experiencing food insecurity and distributed 1200 food boxes.',
            used_fields: ['programs[0].whatWeDo', 'programs[0].whoWeServe', 'programs[0].outputs[0]'],
          },
        ],
        overall_notes: 'All statements are grounded in provided inputs.',
        warnings: [],
      }),
    });

    const result = await service.generate({ input: baseInput(), llm });

    expect(result.refused).toBe(false);
    expect(result.narrative).toContain('Food Support Program:');
    expect(result.narrative).toContain('1200');
    expect(result.traceability[0]?.program_name).toBe('Food Support Program');
  });

  it('missing-input refusal path fails closed', async () => {
    const service = new Form990NarrativeIntelligenceService();

    const bad = baseInput();
    bad.programs[0] = {
      ...bad.programs[0],
      // Still passes schema min(50), but fails deterministic policy minWhatWeDoChars (80).
      whatWeDo: 'Intentionally short description to trigger refusal by policy only.',
    } as any;

    const llm = async () => ({ text: '{}' });
    const result = await service.generate({ input: bad, llm });

    expect(result.refused).toBe(true);
    expect(result.refusal_reason).toBe('INSUFFICIENT_PROGRAM_DETAIL');
  });

  it('no-invention guard refuses when model introduces unsupported numbers', async () => {
    const service = new Form990NarrativeIntelligenceService();

    const llm = async () => ({
      text: JSON.stringify({
        program_narratives: [
          {
            program_name: 'Food Support Program',
            narrative:
              'The program distributed 9999 food boxes and improved outcomes by 25%.',
            used_fields: ['programs[0].outputs[0]'],
          },
        ],
        overall_notes: '',
        warnings: [],
      }),
    });

    const result = await service.generate({ input: baseInput(), llm });

    expect(result.refused).toBe(true);
    expect(result.refusal_reason).toBe('UNSUPPORTED_CLAIMS_DETECTED');
  });
});

