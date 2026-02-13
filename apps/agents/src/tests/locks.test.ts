import test from 'node:test';
import assert from 'node:assert/strict';
import { tryAdvisoryLock } from '../scheduler/locks';

test('DB advisory lock acquisition blocks concurrent run for same key', async () => {
  let call = 0;
  const fakeDb = {
    $queryRaw: async (_strings: TemplateStringsArray, ..._values: any[]) => {
      call++;
      // 1st call: try lock => true, 2nd call: try lock => false, 3rd call: unlock
      if (call === 1) return [{ locked: true }];
      if (call === 2) return [{ locked: false }];
      return [{ unlocked: true }];
    },
  };

  const lock1 = await tryAdvisoryLock('ComplianceWatchdog:org:1:2026-02-13T09:00:00.000Z', fakeDb);
  assert.equal(lock1.acquired, true);

  const lock2 = await tryAdvisoryLock('ComplianceWatchdog:org:1:2026-02-13T09:00:00.000Z', fakeDb);
  assert.equal(lock2.acquired, false);

  await lock1.release();
});

