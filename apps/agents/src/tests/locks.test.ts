import test from 'node:test';
import assert from 'node:assert/strict';
import { tryAdvisoryXactLock } from '../scheduler/locks';

test('DB advisory xact lock acquisition returns false when lock is held', async () => {
  let call = 0;
  const fakeDb = {
    $queryRaw: async (_strings: TemplateStringsArray, ..._values: any[]) => {
      call++;
      // 1st call: try lock => true, 2nd call: try lock => false
      if (call === 1) return [{ locked: true }];
      return [{ locked: false }];
    },
  };

  const acquired1 = await tryAdvisoryXactLock('ComplianceWatchdog:org:1:2026-02-13T09:00:00.000Z', fakeDb);
  assert.equal(acquired1, true);

  const acquired2 = await tryAdvisoryXactLock('ComplianceWatchdog:org:1:2026-02-13T09:00:00.000Z', fakeDb);
  assert.equal(acquired2, false);
});
