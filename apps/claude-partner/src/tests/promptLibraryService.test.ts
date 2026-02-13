import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptLibraryService } from '../services/PromptLibraryService';

test('createPromptVersion rejects system prompt without role definition', async () => {
  const db: any = {
    orgPromptLibrary: {
      create: async () => {
        throw new Error('should_not_be_called');
      },
      findFirst: async () => null,
    },
    $transaction: async (fn: any) => fn(db),
  };
  const svc = new PromptLibraryService(db);
  await assert.rejects(
    () =>
      svc.createPromptVersion(
        'org1',
        'INTERNAL_MEMO',
        'Summarize the org context, constraints, and next steps for the user in a structured format.',
        'Memo: {{topic}}',
      ),
    /SYSTEM_PROMPT_ROLE_REQUIRED/,
  );
});

test('createPromptVersion rejects user template without variable placeholder', async () => {
  const db: any = {
    orgPromptLibrary: {
      create: async () => {
        throw new Error('should_not_be_called');
      },
      findFirst: async () => null,
    },
    $transaction: async (fn: any) => fn(db),
  };
  const svc = new PromptLibraryService(db);
  await assert.rejects(
    () => svc.createPromptVersion('org1', 'INTERNAL_MEMO', 'You are an assistant. Role: helper.', 'No variables here.'),
    /USER_TEMPLATE_PLACEHOLDER_REQUIRED/,
  );
});

test('createPromptVersion auto-increments version from latest', async () => {
  let created: any = null;
  const db: any = {
    orgPromptLibrary: {
      findFirst: async () => ({ version: 2 }),
      create: async (args: any) => {
        created = args.data;
        return {
          id: 'p3',
          orgId: args.data.orgId,
          name: args.data.name,
          promptType: args.data.promptType,
          systemPrompt: args.data.systemPrompt,
          userTemplate: args.data.userTemplate,
          version: args.data.version,
          isActive: args.data.isActive,
          createdAt: args.data.createdAt,
        };
      },
    },
    $transaction: async (fn: any) => fn(db),
  };
  const svc = new PromptLibraryService(db);
  const res = await svc.createPromptVersion(
    'org1',
    'INTERNAL_MEMO',
    'You are an assistant. Role: helper for ops.',
    'Write memo about {{topic}}.',
  );
  assert.equal(res.version, 3);
  assert.equal(created.version, 3);
});
