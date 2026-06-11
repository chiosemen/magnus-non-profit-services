import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import WorkerService from '../../src/services/WorkerService';
import { prisma } from '@magnus/db';
import { NotFoundError } from '../../src/utils/errors';

describe('Wave 1: WorkerService Persistence Proof', () => {

  test('WorkerService: getMultiOrgProfile throws NotFoundError rather than resolving an empty cache/memory map', async () => {
    const service = new WorkerService();
    
    try {
      await service.getMultiOrgProfile('missing-user-1234');
      assert.fail('Should have thrown NotFoundError');
    } catch (err: any) {
      assert.ok(err instanceof NotFoundError, 'Must explicitly trap into NOT_FOUND if Prisma lookup is empty');
      assert.match(err.message, /No organizations found/);
    }
  });

  test('WorkerService: registerOrg refuses to mock state in-memory', async () => {
    const service = new WorkerService();
    
    try {
      await service.registerOrg('u1', {} as any);
      assert.fail('Should have thrown prohibition error');
    } catch (err: any) {
      assert.match(err.message, /prohibited/i, 'Must explicitly crash when trying to seed cache logic');
    }
  });
});
