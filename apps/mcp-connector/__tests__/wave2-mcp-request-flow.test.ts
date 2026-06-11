import request from 'supertest';
import app from '../src/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@magnus/db/client';

// We do NOT mock auth/dispatch/audit or WorkerService internals.
// We explicitly hit the real Express application using Supertest to prove transport logic.
// We only spy on Prisma to intercept physical DB writes/reads to prove they were invoked truthfully without spinning up Postgres locally.

jest.mock('@magnus/db/client', () => ({
  prisma: {
    workerOrgRelationship: {
      findMany: jest.fn(),
    },
    agentOperationalMemoryEntry: {
      create: jest.fn(),
    },
  },
}));

describe('Wave 2: Full Request-Path MCP Proof', () => {
  const secret = process.env.JWT_SECRET || 'wave-6-super-secure-production-ready-test-secret-32b';
  process.env.JWT_SECRET = secret;
  process.env.JWT_ISSUER = 'magnus-mcp-connector';
  process.env.JWT_AUDIENCE = 'magnus-nonprofit-os';

  const validToken = jwt.sign({
    sub: 'worker-1',
    orgId: 'org-1',
    email: 'worker@example.com',
    roles: ['admin'],
    permissions: ['*'],
    sessionId: 'session-123'
  }, secret, {
    issuer: 'magnus-mcp-connector',
    audience: 'magnus-nonprofit-os'
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. Authenticated transport executes and audit is written cleanly', async () => {
    // Simulate WorkerService DB lookup successfully confirming org match for the user
    (prisma.workerOrgRelationship.findMany as jest.Mock).mockResolvedValueOnce([
      { organization: { ein: 'test-ein-999', name: 'Test Org' } }
    ]);
    (prisma.agentOperationalMemoryEntry.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/tools/execute')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ toolName: 'get-multi-org-profile', params: { eins: ['test-ein-999'] } });

    // Request resolves and executes internally
    expect(res.status).toBe(200);
    expect(res.body.org_count).toBe(1);
    
    // Crucial: Audio is explicitly written across both the CALL and RESULT boundary
    expect(prisma.agentOperationalMemoryEntry.create).toHaveBeenCalledTimes(2);
    expect((prisma.agentOperationalMemoryEntry.create as jest.Mock).mock.calls[0][0].data.kind).toBe('tool_call');
    expect((prisma.agentOperationalMemoryEntry.create as jest.Mock).mock.calls[1][0].data.kind).toBe('tool_result');
  });

  it('2. Central Authorization Rejects unauthorized cross-org IDOR payloads', async () => {
    // The DB confirms the worker only belongs to 'test-ein-999'.
    (prisma.workerOrgRelationship.findMany as jest.Mock).mockResolvedValueOnce([
      { organization: { ein: 'test-ein-999' } }
    ]);
    (prisma.agentOperationalMemoryEntry.create as jest.Mock).mockResolvedValue({});

    // The attacker explicitly passes a different EIN via params pretending to have access
    const res = await request(app)
      .post('/tools/execute')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ toolName: 'get-multi-org-profile', params: { ein: 'cross-org-777' } });

    // Server must physically trap the boundary and deny execution
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_EIN');
    
    // The attempt and failure must still be audited natively!
    expect(prisma.agentOperationalMemoryEntry.create).toHaveBeenCalledTimes(2);
  });

  it('3. Fails closed when transport fails validation (No DB bypass)', async () => {
    const invalidToken = jwt.sign({ sub: 'worker-bad' }, 'wrong-secret');

    const res = await request(app)
      .post('/tools/execute')
      .set('Authorization', `Bearer ${invalidToken}`)
      .send({ toolName: 'get-multi-org-profile', params: {} });

    // Native transport reject
    expect(res.status).toBe(401);
  });
});
