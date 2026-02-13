/**
 * Magnus MCP Tool — get-state-registrations
 * Returns state charitable solicitation registrations and renewal deadlines
 */

import { z } from 'zod';
import ComplianceService from '../../services/ComplianceService';

export const getStateRegistrationsSchema = z.object({
  ein: z.string().min(9).describe('EIN of the nonprofit'),
  states: z.array(z.string().length(2)).optional().describe('Filter to specific state codes (e.g. ["CA","NY"])'),
});

export type GetStateRegistrationsInput = z.infer<typeof getStateRegistrationsSchema>;

const service = new ComplianceService();

export async function execute(input: GetStateRegistrationsInput): Promise<string> {
  const { ein, states } = getStateRegistrationsSchema.parse(input);
  let registrations = await service.getStateRegistrations(ein);

  if (states?.length) {
    registrations = registrations.filter(r => states.includes(r.stateCode));
  }

  const now = new Date();
  const enriched = registrations.map(r => {
    const renewalDate = r.renewalDueDate ? new Date(r.renewalDueDate) : null;
    const daysUntilRenewal = renewalDate
      ? Math.floor((renewalDate.getTime() - now.getTime()) / 86400000)
      : null;

    return {
      state: r.state,
      state_code: r.stateCode,
      registration_number: r.registrationNumber ?? 'Not on file',
      status: r.status,
      expiration_date: r.expirationDate ?? 'N/A',
      renewal_due_date: r.renewalDueDate ?? 'N/A',
      days_until_renewal: daysUntilRenewal,
      renewal_urgency: daysUntilRenewal !== null
        ? daysUntilRenewal < 0 ? 'OVERDUE'
          : daysUntilRenewal < 30 ? 'URGENT'
          : daysUntilRenewal < 90 ? 'UPCOMING'
          : 'OK'
        : 'UNKNOWN',
      annual_report_required: r.annualReportRequired,
      charitable_solicitation_required: r.charitableSolicitationRequired,
    };
  });

  const overdue = enriched.filter(r => r.renewal_urgency === 'OVERDUE').length;
  const urgent = enriched.filter(r => r.renewal_urgency === 'URGENT').length;

  return JSON.stringify({
    ein,
    total_states: enriched.length,
    summary: {
      active: enriched.filter(r => r.status === 'active').length,
      expired: enriched.filter(r => r.status === 'expired').length,
      overdue_renewals: overdue,
      urgent_renewals: urgent,
    },
    alert: overdue > 0
      ? `⚠️ ${overdue} state registration(s) are overdue — immediate action required`
      : urgent > 0
        ? `🕐 ${urgent} state registration(s) due within 30 days`
        : null,
    registrations: enriched,
  }, null, 2);
}

export default { name: 'get-state-registrations', schema: getStateRegistrationsSchema, execute };
