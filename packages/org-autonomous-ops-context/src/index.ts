export {
  OrgIdentityFilesService,
  MAX_ORG_CONTEXT_CONTENT_BYTES,
  parseOrgContextFileKind,
  ORG_CONTEXT_FILE_KINDS,
} from './orgIdentityFilesService';
export type { OrgIdentityTemplateInput } from './templates';
export { defaultMarkdownForKind } from './templates';
export {
  MAGNUS_TEMPLATE_VERSION,
  magnusTemplateComment,
  extractMagnusTemplateMeta,
  hasMagnusTemplateMarker,
} from './orgContextTemplateMarkers';

export {
  parseOrgIdentityForGrantProfile,
} from './orgIdentityParsers/grantProfile';
export type {
  ParsedOrgGrantProfile,
  ParseOrgIdentityForGrantProfileResult,
} from './orgIdentityParsers/grantProfile';

export {
  buildOrgContextValidationReport,
} from './orgContextValidation';
export type {
  OrgContextConfiguredState,
  OrgContextKindStatus,
  OrgContextFileReportRow,
  OrgContextValidationReport,
  BuildOrgContextValidationReportInput,
} from './orgContextValidation';
export {
  AgentHandoffService,
  HANDOFF_AUDIT_ACTIONS,
  MAX_HANDOFF_TITLE_CHARS,
  MAX_HANDOFF_BODY_BYTES,
} from './agentHandoffService';
export type { CreateHandoffInput, TransitionHandoffInput } from './agentHandoffService';
export { AlertLifecycleService, ALERT_AUDIT_ACTIONS } from './alertLifecycleService';
export type { TransitionAlertInput, SetAlertOwnerInput, LinkAlertInput } from './alertLifecycleService';
export type { ExecutiveModuleKey, ModuleStateCode, Severity, Destination, DestinationStatus } from './executiveSemantics';
export { severityRank, moduleStateRank, isKnownSeverity } from './executiveSemantics';
export { buildExecutiveBoard } from './executiveBoard';
export type { ExecutiveBoard, ModuleStateRow, TopItem, EvidenceRef } from './executiveBoard';
export { deriveWhatMattersNow } from './whatMattersNow';
export type { WhatMattersNowItem, WhatMattersNowCategory } from './whatMattersNow';
export { buildActiveObligations } from './activeObligations';
export type { ActiveObligation, ObligationKind } from './activeObligations';
export {
  OrgMemoryService,
  AUTONOMOUS_OPS_MEMORY_DISCLAIMER,
} from './orgMemoryService';
export type {
  AppendOperationalMemoryInput,
  CreateCuratedMemoryInput,
  IngestSemanticChunkInput,
} from './orgMemoryService';

export { buildFinancialSummary } from './financialSummary';
export type { FinancialSummary } from './financialSummary';

export {
  DEFAULT_MEMORY_SUFFICIENCY_THRESHOLDS,
  evaluateMemorySufficiency,
} from './memorySufficiency';
export type {
  MemorySufficiencyThresholds,
  MemorySufficiencyStats,
  MemorySufficiencyEvaluation,
} from './memorySufficiency';
export { loadMemorySufficiencyStatsForOrg } from './memorySufficiencyStats';

export {
  buildPilotReadiness,
  rollUpPilotReadiness,
} from './pilotReadiness';
export type {
  ReadinessCategory,
  PilotReadinessDimension,
  PilotReadinessOverall,
  PilotReadinessSnapshot,
  BuildPilotReadinessInput,
} from './pilotReadiness';

export { buildLaunchReadinessReport } from './launchReadiness';
export type {
  LaunchReadinessStatus,
  LaunchReadinessReport,
  BuildLaunchReadinessInput as BuildLaunchReadinessReportInput,
} from './launchReadiness';

export { AutonomousOpsSettingsService } from './autonomySettingsService';
export type {
  AutonomousOpsSettings,
  UpsertAutonomousOpsSettingsInput,
  BoundaryMode,
} from './autonomySettingsService';

export { deriveDonorOpsModuleState } from './donorOpsModule';
export type { DeriveDonorOpsModuleStateInput, DonorOpsModuleDerived } from './donorOpsModule';
export {
  appendDonorEvent,
  DONOR_EVENT_DUPLICATE,
  listDonorEvents,
} from './donorEventsService';
export type { AppendDonorEventInput, DonorEventDto, ListDonorEventsOptions } from './donorEventsService';

export { deriveVolunteerOpsModuleState } from './volunteerOpsModule';
export type {
  DeriveVolunteerOpsModuleStateInput,
  VolunteerOpsModuleDerived,
} from './volunteerOpsModule';
export {
  appendVolunteerEvent,
  listVolunteerEvents,
  VOLUNTEER_EVENT_DUPLICATE,
} from './volunteerEventsService';
export type {
  AppendVolunteerEventInput,
  ListVolunteerEventsOptions,
  VolunteerEventDto,
} from './volunteerEventsService';

export {
  buildPortfolioAccountabilitySnapshot,
  EXECUTIVE_BOARD_COMPLIANCE_DUE_SOON_DAYS,
  isComplianceDueSoonNotFiled,
  isComplianceOverdueNotFiled,
  partitionComplianceCalendarRows,
  PORTFOLIO_CONTROL_TOWER_NAV_PRESETS,
} from './portfolioAccountability';
export type {
  ComplianceCalendarRowLite,
  ControlTowerNavPreset,
  PortfolioAccountabilityRollups,
  PortfolioAccountabilitySnapshot,
} from './portfolioAccountability';
export {
  ACCORD_CONNECTOR_REGISTRY,
  CLIENT_CONNECTOR_PANEL_KEYS,
  buildClientConnectorPanels,
  listAllRegistryKeys,
} from './connectorRegistry';
export type {
  AccordConnectorKey,
  AccordConnectorRegistryEntry,
  ClientConnectorPanelKey,
  ConnectorActionDef,
  ConnectorActionKind,
  ConnectorClientPanelRow,
  ConnectorMaturity,
} from './connectorRegistry';
export {
  ACCORD_ACTION_CLASSES,
  ACCORD_CONNECTOR_ACTION_MATRIX,
  getConnectorActionPolicy,
  IRREVERSIBLE_ACTION_CLASS,
  isAutonomousActionAllowed,
} from './accordActionMatrix';
export type {
  AccordActionClass,
  AccordActionPolicyBand,
  ConnectorActionMatrixRow,
} from './accordActionMatrix';

export {
  buildAutonomyPolicySurface,
  getLaunchAgentPolicyRows,
} from './launchAgentPolicyReadModel';
export type {
  AutonomyPolicySurface,
  LaunchAgentPilotPositioning,
  LaunchAgentPolicyRow,
} from './launchAgentPolicyReadModel';

export { buildOperationsLog } from './operationsLog';
export type {
  BuildOperationsLogInput,
  OperationsLogActorKind,
  OperationsLogEvidenceLink,
  OperationsLogPrimaryRef,
  OperationsLogRow,
  OperationsLogRowType,
} from './operationsLog';

export {
  listDonors,
  createDonor,
  updateDonor,
  getDonorDetail,
  createManualDonation,
  listDonations,
  issueReceipt,
  getReceiptMetadata,
  voidReceipt,
  getReceiptByDonationId,
  previewCsvImport,
  commitCsvImport,
} from './donorCrmService';
export type {
  DonorDto,
  DonationDto,
  ReceiptDto,
  CsvPreviewRow,
  CsvPreviewResult,
} from './donorCrmService';

export {
  getStripeConnectStatus,
  createStripeConnectOnboardingLink,
  refreshStripeConnectOnboardingLink,
} from './stripeConnectService';
export type {
  StripeConnectAccountSnapshot,
  StripeConnectGateway,
  StripeConnectOnboardingLink,
  StripeConnectStatusDto,
  StripeConnectLinkDto,
} from './stripeConnectService';

export {
  listCampaigns,
  createCampaign,
  getCampaignById,
  updateCampaign,
  publishCampaign,
  archiveCampaign,
} from './campaignService';
export type {
  CampaignDto,
  CreateCampaignInput,
  UpdateCampaignInput,
} from './campaignService';

export {
  calculateFeeCoverage,
  getPublicCampaign,
  createDonationCheckoutSession,
  PAYMENT_PILOT_DISABLED_MESSAGE,
  PaymentProcessingNotEnabledError,
  StripeConnectNotReadyError,
  verifyStripeSignature,
  processWebhookEvent,
} from './stripePaymentService';

export {
  createFund,
  listFunds,
  updateFund,
  createAccount,
  listAccounts,
  updateAccount,
  allocateDonation,
  postLedgerTransaction,
  getFundBalanceReport,
  getIncomeExpenseReport,
  getBoardFinancialSummary,
} from './fundAccountingService';
export type {
  FundDto,
  AccountDto,
  LedgerEntryInput,
  LedgerTransactionInput,
  FundBalanceReportRow,
  IncomeExpenseReportRow,
  BoardFinancialSummary,
} from './fundAccountingService';

export {
  createProposal,
  listProposals,
  updateProposalStatus,
  applyProposal,
  ValidationError as ConciergeValidationError,
  NotFoundError as ConciergeNotFoundError,
  ForbiddenError as ConciergeForbiddenError,
} from './conciergeProposalService';
export type {
  CreateProposalInput,
} from './conciergeProposalService';

export {
  analyzeLegacyCsvMapping,
  suggestDonorSegmentation,
  generateCampaignDraft,
  generateBoardBriefDraft,
  suggestComplianceReminders,
  sanitizeInput,
  AiConfigError as ConciergeAiConfigError,
  SecurityError as ConciergeSecurityError,
} from './conciergeAiService';

export {
  createGrant,
  listGrants,
  getGrant,
} from './grantService';
export type { GrantDto } from './grantService';

export {
  createComplianceDeadline,
  updateComplianceStatus,
  listComplianceCalendar,
} from './complianceService';
export type { ComplianceDeadlineDto } from './complianceService';

export {
  buildExecutivePacket,
} from './executivePacketService';
export type { ExecutivePacketDto } from './executivePacketService';

export {
  createVolunteer,
  listVolunteers,
  logVolunteerHours,
  createEvent,
  listEvents,
  registerAttendee,
  createSponsorshipTier,
} from './volunteerService';
export type {
  VolunteerDto,
  EventDto,
  EventRegistrationDto,
  SponsorshipTierDto,
} from './volunteerService';

export {
  buildBoardPacket,
} from './boardPacketService';
export type { BoardPacketDto } from './boardPacketService';
