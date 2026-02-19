export type PromptType =
  | 'GRANT_DRAFT'
  | 'BOARD_REPORT'
  | 'DONOR_UPDATE'
  | 'INTERNAL_MEMO';

export type OrgPromptLibraryRecord = {
  id: string;
  orgId: string;
  name: string;
  promptType: PromptType;
  systemPrompt: string;
  userTemplate: string;
  version: number;
  isActive: boolean;
  createdAt: Date;
};

export type CreatePromptVersionRequest = {
  promptType: PromptType;
  systemPrompt: string;
  userTemplate: string;
};
