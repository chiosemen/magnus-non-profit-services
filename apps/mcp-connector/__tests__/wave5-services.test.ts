import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FinancialService } from '../../src/services/FinancialService';
import { ComplianceService } from '../../src/services/ComplianceService';

// Disable all external networking hooks since this tests logic bounds
process.env.FEATURE_FLAG_WORKER_FINANCIALS = 'false'; // testing wave1 fail-closed reality

describe('Wave 5 Critical Path: MCP Audits & Services fail-closed proofs', () => {

  describe('FinancialService', () => {
    
    test('calculateWorkerFinancials: Fails-closed explicitly instead of generating fake random data', async () => {
       const svc = new FinancialService('placeholder');
       
       // Verify no Math.random() fabrication is returned anymore.
       // Because FEATURE_FLAG_WORKER_FINANCIALS=false, it inherently fails closed or throws an error.
       try {
          const res = await svc.calculateWorkerFinancials('org-123', 'worker-456');
          // If it resolves, verify it is empty rather than fake.
          assert.deepEqual(res.grossIncome, { value: 0, currency: 'USD' }, 'Gross income must evaluate zero when missing real context, not random estimates');
          assert.equal(res.verificationStatus, 'UNVERIFIED', 'Without explicit Plaid proofs, must default to UNVERIFIED');
          assert.equal(res.sources.length, 0, 'No fake W2s or simulated inputs');
       } catch (err: any) {
          // If there is a FEATURE_NOT_CONFIGURED check, this is perfectly valid fail-closed behavior
          assert.match(err.message, /not configured|disabled|required|FEATURE_FLAG_WORKER_FINANCIALS/);
       }
    });

  });

  describe('ComplianceService', () => {

    test('getOrgComplianceHealth: Requires explicit real inputs, no hardcoded NY/CA fallback states', async () => {
       const svc = new ComplianceService('placeholder');
       
       try {
          const res = await svc.getOrgComplianceHealth('org-missing');
          // No fake CA registrations
          assert.equal(res.registrations.length, 0, 'Missing orgs should never return fake default CA/NY registrations');
          assert.equal(res.status, 'UNKNOWN', 'Fails closed to UNKNOWN');
       } catch (err: any) {
         assert.match(err.message, /not found|disabled|required/i);
       }
    });
  });

});
