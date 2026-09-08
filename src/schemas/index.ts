/**
 * Versioned workflow schemas for Graphic Design System (schemaVersion = 1).
 *
 * Hard constraints and creative preferences are separate fields everywhere
 * they appear. Integrity helpers reject missing approvals and unsupported
 * factual claims (prices, dates, testimonials, logos, certifications, contacts).
 */

export { SCHEMA_VERSION, type SchemaVersion } from "./version.js";

export {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  UrlSchema,
  HexColorSchema,
  Sha256Schema,
  DocumentMetaSchema,
  HardConstraintsSchema,
  CreativePreferencesSchema,
  ApprovalSubjectSchema,
  ApprovalStatusSchema,
  ClaimKindSchema,
  SupportedClaimSchema,
  FailureStateSchema,
  okFailureState,
  type DocumentMeta,
  type HardConstraints,
  type CreativePreferences,
  type ApprovalSubject,
  type ApprovalStatus,
  type ClaimKind,
  type SupportedClaim,
  type FailureState,
} from "./common.js";

export {
  ApprovalRecordSchema,
  isApproved,
  requireApproved,
  type ApprovalRecord,
} from "./approval-record.js";

export {
  ApprovedCopySchema,
  exactCopyStrings,
  type ApprovedCopy,
} from "./approved-copy.js";

export {
  ChannelSchema,
  DesignBriefSchema,
  type Channel,
  type DesignBrief,
} from "./design-brief.js";

export {
  BrandColorTokenSchema,
  BrandFontTokenSchema,
  BrandLogoRefSchema,
  BrandVoiceSchema,
  BrandAssetClassSchema,
  BrandAssetEntrySchema,
  AssetLicenseRecordSchema,
  LogoRulesSchema,
  ImageStyleSchema,
  BrandProfileSchema,
  fixedAssets,
  distinctiveAssets,
  variableAssets,
  approvalRequiredAssets,
  type BrandProfile,
  type BrandVoice,
  type BrandAssetEntry,
  type BrandAssetClass,
  type AssetLicenseRecord,
  type LogoRules,
  type ImageStyle,
} from "./brand-profile.js";

export {
  DistinctivenessEvidenceStatusSchema,
  DistinctivenessAssetFindingSchema,
  DistinctivenessAuditSchema,
  type DistinctivenessEvidenceStatus,
  type DistinctivenessAssetFinding,
  type DistinctivenessAudit,
} from "./distinctiveness-audit.js";

export {
  IntakeOutputFormatSchema,
  DesignIntakeSchema,
  type IntakeOutputFormat,
  type DesignIntake,
} from "./intake.js";

export {
  TypographyDirectionSchema,
  TypographyBehaviorSchema,
  HierarchySchema,
  MessageHierarchySchema,
  StyleAxisSchema,
  ImageStrategySchema,
  ConceptSchema,
  normalizeConceptFields,
  type Concept,
  type StyleAxis,
  type ImageStrategy,
} from "./concept.js";

export {
  CONCEPT_BOARD_SIZE,
  MIN_DISTINCT_GOVERNING_IDEAS,
  MIN_INDEPENDENT_METAPHORS,
  DIRECTIONS_TO_SELECT,
  ConceptBoardStatusSchema,
  ConceptBoardDiversityReportSchema,
  ConceptBoardSchema,
  listSelectedConcepts,
  listRejectedConcepts,
  type ConceptBoardStatus,
  type ConceptBoardDiversityReport,
  type ConceptBoard,
} from "./concept-board.js";

export { DesignSpecSchema, type DesignSpec } from "./design-spec.js";

export {
  AdaptFormatIdSchema,
  ViewingDistanceSchema,
  CtaPrioritySchema,
  LogoBehaviorSchema,
  ImageCropBehaviorSchema,
  QrPlacementSchema,
  LengthBudgetSchema,
  FormatAdaptationProfileSchema,
  ContentAdaptationActionSchema,
  ContentAdaptationItemSchema,
  FormatAdaptationReportSchema,
  channelForFormat,
  type AdaptFormatId,
  type ViewingDistance,
  type CtaPriority,
  type LogoBehavior,
  type ImageCropBehavior,
  type QrPlacement,
  type FormatAdaptationProfile,
  type ContentAdaptationAction,
  type ContentAdaptationItem,
  type FormatAdaptationReport,
} from "./format-profile.js";

export {
  ExportFormatSchema,
  ToolVersionsSchema,
  RenderResultSchema,
  type ExportFormat,
  type RenderResult,
} from "./render-result.js";

export {
  CritiqueDimensionIdSchema,
  CRITIQUE_DIMENSION_IDS,
  CritiqueConfidenceSchema,
  CritiqueFindingLocationSchema,
  CritiqueFindingSchema,
  CritiqueDimensionScoreSchema,
  CritiqueDimensionSchema,
  CritiqueSchema,
  PairwiseComparisonTrialSchema,
  PairwiseDisagreementSchema,
  PairwiseComparisonSessionSchema,
  HumanTestAnswerSchema,
  HumanCritiqueTestSchema,
  DesignVersionCritiqueRecordSchema,
  type CritiqueDimensionId,
  type CritiqueConfidence,
  type CritiqueFinding,
  type CritiqueDimensionScore,
  type Critique,
  type PairwiseComparisonTrial,
  type PairwiseDisagreement,
  type PairwiseComparisonSession,
  type HumanTestAnswer,
  type HumanCritiqueTest,
  type DesignVersionCritiqueRecord,
} from "./critique.js";

export {
  PreflightCheckStatusSchema,
  PreflightSeveritySchema,
  PreflightCategorySchema,
  PreflightLocationSchema,
  PreflightCheckSchema,
  PreflightReportSchema,
  type PreflightSeverity,
  type PreflightCategory,
  type PreflightLocation,
  type PreflightCheck,
  type PreflightReport,
} from "./preflight-report.js";

export {
  AssetKindSchema,
  AssetProvenanceSchema,
  AssetEntrySchema,
  AssetManifestSchema,
  type AssetEntry,
  type AssetProvenance,
  type AssetManifest,
} from "./asset-manifest.js";

export {
  IntegrityError,
  assertBriefIntegrity,
  assertCopyIntegrity,
  findUnsupportedFactualStrings,
} from "./integrity.js";

export {
  CanvaCapabilityKindSchema,
  CanvaCapabilityStatusSchema,
  CanvaToolDescriptorSchema,
  CanvaToolDiscoveryLogSchema,
  CanvaCapabilityProbeSchema,
  CanvaToolRateLimitSchema,
  CanvaAccountCapabilityReportSchema,
  DesignCandidateSchema,
  CandidatePresentationSchema,
  EditableElementRefSchema,
  EditingTransactionStateSchema,
  CanvaAdapterPhaseSchema,
  CanvaAdapterSessionSchema,
  type CanvaCapabilityKind,
  type CanvaCapabilityStatus,
  type CanvaToolDescriptor,
  type CanvaToolDiscoveryLog,
  type CanvaCapabilityProbe,
  type CanvaToolRateLimit,
  type CanvaAccountCapabilityReport,
  type DesignCandidate,
  type CandidatePresentation,
  type EditableElementRef,
  type EditingTransactionState,
  type CanvaAdapterPhase,
  type CanvaAdapterSession,
} from "./canva-session.js";

export {
  StructuredErrorStateSchema,
  OkStructuredStateSchema,
  WorkflowErrorStateSchema,
  okWorkflowErrorState,
  AuditEventKindSchema,
  AuditEventSchema,
  type StructuredErrorState,
  type WorkflowErrorState,
  type AuditEventKind,
  type AuditEvent,
} from "./structured-error.js";

export {
  VersionedArtifactKindSchema,
  VersionedArtifactRefSchema,
  JobPhaseSchema,
  JobHistoryEntrySchema,
  JobManifestSchema,
  type VersionedArtifactKind,
  type VersionedArtifactRef,
  type JobPhase,
  type JobHistoryEntry,
  type JobManifest,
} from "./job-manifest.js";

export {
  CanvaProvenanceSourceSchema,
  CanvaProvenanceSchema,
  PilotHumanReviewNotesSchema,
  PilotMetricScoresSchema,
  BaselineDesignRecordSchema,
  PilotComparisonDeltaSchema,
  PilotFormatPackageSchema,
  PilotFailureSeveritySchema,
  PilotFailureRecordSchema,
  PilotEvaluationReportSchema,
  type CanvaProvenanceSource,
  type CanvaProvenance,
  type PilotHumanReviewNotes,
  type PilotMetricScores,
  type BaselineDesignRecord,
  type PilotComparisonDelta,
  type PilotFormatPackage,
  type PilotFailureRecord,
  type PilotEvaluationReport,
} from "./pilot-evaluation.js";
