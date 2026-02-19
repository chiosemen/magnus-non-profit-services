export type ClaudeOrgConfig = {
  orgId: string;
  enabled: boolean;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
};

export type ClaudeMessageRequest = {
  orgId: string;
  userText: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

export type ClaudeMessageResponse = {
  requestId: string;
  model: string;
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
};
