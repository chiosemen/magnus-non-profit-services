import { describe, expect, it } from 'vitest';
import { LoiGeneratorService, type LoiRequest } from '@magnus/grants';

function baseInput(params?: Partial<LoiRequest>): LoiRequest {
  return {
    org: {
      name: 'Community Health Alliance',
      ein: '123456789',
      mission: 'Improve health outcomes through accessible community services.',
    },
    program: {
      name: 'Mobile Clinic Program',
      summary:
        'We operate recurring mobile clinic days that provide preventive screenings and referrals, coordinated with local partners to reduce barriers to access for underserved residents.',
      serviceArea: 'San Bernardino County, CA',
      outputs: [{ label: 'Clinic visits', value: 500, unit: 'visits' }],
    },
    ask: {
      amountUsd: 75000,
      intendedUseOfFunds:
        'Support staffing, medical supplies, and transportation costs required to expand the mobile clinic schedule and maintain consistent service delivery.',
      timeframe: '12 months',
    },
    funder: {
      profileProvided: true,
      profile: {
        funderName: 'Green Family Foundation',
        priorities: ['community health access', 'preventive care', 'underserved populations'],
        constraints: ['prefers LOI before full proposal'],
        evidence: [{ note: 'Provided by applicant from foundation website.' }],
      },
    },
    constraints: { requireFunderFit: true, maxChars: 2400, tone: 'professional' },
    ...(params ?? {}),
  } as LoiRequest;
}

describe('LoiGeneratorService', () => {
  it('successful grounded LOI generation returns draft + grounding', async () => {
    const service = new LoiGeneratorService();

    const llm = async () => ({
      text: JSON.stringify({
        sections: {
          intro: { text: 'Thank you for considering this letter of inquiry.', used_fields: ['org.name', 'funder.profile.funderName'] },
          org: { text: 'Community Health Alliance improves health outcomes through accessible community services.', used_fields: ['org.mission'] },
          program: { text: 'The Mobile Clinic Program provides recurring preventive screenings and referrals across San Bernardino County, CA, including 500 clinic visits.', used_fields: ['program.summary', 'program.serviceArea', 'program.outputs[0]'] },
          ask: { text: 'We respectfully request $75000 to support staffing, medical supplies, and transportation to expand and maintain services over 12 months.', used_fields: ['ask.amountUsd', 'ask.intendedUseOfFunds', 'ask.timeframe'] },
          fit: { text: 'This request aligns with Green Family Foundation priorities in community health access and preventive care.', used_fields: ['funder.profile.priorities', 'funder.profile.funderName'], omitted: false },
          closing: { text: 'We welcome the opportunity to share additional information.', used_fields: [] },
        },
        warnings: [],
        generated_phrasing_only: ['We respectfully request your consideration.'],
      }),
    });

    const result = await service.generate({ input: baseInput(), llm });

    expect(result.refused).toBe(false);
    expect(result.loi_draft).toContain('Funding Request');
    expect(result.grounding.length).toBeGreaterThan(0);
    expect(result.facts_vs_phrasing.facts_used.length).toBeGreaterThan(0);
  });

  it('missing-input refusal: missing intended use fails closed', async () => {
    const service = new LoiGeneratorService();
    const input = baseInput({
      ask: { amountUsd: 75000, intendedUseOfFunds: 'Too short.' },
    } as any);

    const result = await service.generate({ input, llm: async () => ({ text: '{}' }) });
    expect(result.refused).toBe(true);
    expect(result.refusal_reason).toBe('MISSING_INTENDED_USE');
  });

  it('funder-profile absence handling: reduced scope when requireFunderFit=false', async () => {
    const service = new LoiGeneratorService();

    const input = baseInput({
      funder: { profileProvided: false },
      constraints: { requireFunderFit: false, maxChars: 2200, tone: 'professional' },
    } as any);

    const llm = async () => ({
      text: JSON.stringify({
        sections: {
          intro: { text: 'Thank you for considering this letter of inquiry.', used_fields: ['org.name'] },
          org: { text: 'Community Health Alliance improves health outcomes through accessible community services.', used_fields: ['org.mission'] },
          program: { text: 'The Mobile Clinic Program provides recurring preventive screenings and referrals across San Bernardino County, CA.', used_fields: ['program.summary', 'program.serviceArea'] },
          ask: { text: 'We respectfully request $75000 to support staffing, supplies, and transportation over 12 months.', used_fields: ['ask.amountUsd', 'ask.intendedUseOfFunds', 'ask.timeframe'] },
          fit: { text: '', used_fields: [], omitted: true },
          closing: { text: 'We welcome the opportunity to share additional information.', used_fields: [] },
        },
        warnings: ['Funder profile not provided; LOI is not tailored to specific priorities.'],
        generated_phrasing_only: [],
      }),
    });

    const result = await service.generate({ input, llm });

    expect(result.refused).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/funder profile/i);
    expect(result.loi_draft).not.toMatch(/Funder Fit/i);
  });
});

