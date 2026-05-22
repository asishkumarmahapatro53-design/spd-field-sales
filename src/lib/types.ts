export type UserRole = "SALES_AGENT" | "MANAGER" | "ACCOUNTING" | "BATCHER" | "MIX_DESIGN" | "PRODUCTION_MANAGER";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type SessionStatus = "OPEN" | "CLOSED";
export type PlantStatus = "ACTIVE" | "WATCH" | "MAINTENANCE";
export type ReadingType = "START" | "END";
export type ReadingStatus =
  | "OCR_PENDING"
  | "AWAITING_CONFIRMATION"
  | "CONFIRMED"
  | "MANUAL_REVIEW_REQUIRED"
  | "MANUAL_VERIFIED"
  | "DISCARDED";
// MOD-001: Reason the agent discarded an odometer upload
export type OdometerDiscardReason = "WRONG_PHOTO" | "BLURRY" | "WRONG_DATE" | "RETAKE" | "OTHER";
// MOD-007: Day completeness status
export type OdometerDayStatus = "COMPLETE" | "INCOMPLETE_START" | "INCOMPLETE_END" | "INCOMPLETE_BOTH" | "EXCEPTION_APPROVED";
// MOD-010: Correction entry type
export type OdometerCorrectionType = "READING_UPDATE" | "REOPEN" | "REIMBURSEMENT_ADJUSTMENT";
export type OdometerLockStatus = "OPEN" | "CLAIMED" | "PAID_LOCKED" | "HISTORICAL_LOCKED" | "REOPENED_FOR_CORRECTION";
// MOD-012: Continuity check result
export type OdometerContinuityStatus = "OK" | "GAP" | "REVERSAL" | "EXCEPTION_APPROVED";
// MOD-013: Upload source type
export type OdometerUploadSource = "LIVE" | "PAST" | "BATCH" | "CORRECTION";
// MOD-006: Batch upload status
export type BatchUploadStatus = "PENDING_REVIEW" | "ACCEPTED" | "REJECTED";
export type LeadStage = "TALKS" | "NEGOTIATING" | "FINALIZED" | "MISSED" | "DEAD" | "LOST";
// MOD-022: Site-level status separate from lead
export type SiteStatus = "ACTIVE" | "DEAD" | "LOST" | "CONVERTED" | "MERGED";
// MOD-017: Active visit tracking
export type ActiveVisitStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
// MOD-016: Phone verification status
export type PhoneVerificationStatus =
  | "UNVERIFIED"
  | "CALL_INITIATED"
  | "CALL_VERIFIED"
  | "WHATSAPP_SENT"
  | "WHATSAPP_CHECKED"
  | "VERIFIED"
  | "INVALID"
  | "FAILED";
export type ContactVerificationChannel = "CALL" | "WHATSAPP";
export type ContactVerificationStatus = "PENDING_CONFIGURATION" | "SENT" | "RECEIVED" | "VERIFIED" | "FAILED";
// MOD-018: Duplicate detection confidence
export type DuplicateMatchStrength = "NONE" | "WEAK" | "MODERATE" | "STRONG";
// MOD-019: Visit edit type for audit
export type VisitEditType = "REMARKS" | "TRANSCRIPTION" | "STAGE" | "FOLLOW_UP" | "GRADE" | "QUANTITY";
// MOD-021: Contact presence at visit
export type ContactPresenceStatus = "PRESENT" | "NOT_PRESENT" | "FOUND_NO_ONE";
// MOD-018: Visit productivity tag
export type VisitProductivityTag = "PRODUCTIVE" | "LOW_QUALITY" | "SUSPICIOUS" | "FOLLOW_UP_NEEDED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
// MOD-026: Final approval workflow status
export type FinalApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CORRECTION_REQUESTED" | "LOCKED";
export type InformalQuotationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CORRECTION_REQUESTED" | "EXPIRED";
export type InformalQuotationPriceType = "GST_INCLUSIVE" | "NON_GST";
export type InformalQuotationPaymentType = "ADVANCE" | "CREDIT";
export type InformalQuotationPdfStatus = "NOT_GENERATED" | "GENERATED" | "FAILED";
export type InformalQuotationEmailStatus = "NOT_SENT" | "SENT" | "FAILED";
export type InformalQuotationWhatsappStatus = "NOT_SENT" | "PENDING_CONFIGURATION" | "SENT" | "FAILED";
export type TaskStatus = "OPEN" | "DONE";
export type HelpRequestStatus = "OPEN" | "RESOLVED";
export type FleetVehicleStatus = "ACTIVE" | "IDLE" | "SERVICE" | "OFF_ROUTE";
export type CreditRisk = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
export type InvoiceStatus = "OPEN" | "PAID" | "OVERDUE" | "PARTIAL";
export type PaymentType = "NORMAL" | "CREDIT";
export type PaymentTerms = "ADVANCE" | "PO" | "PDC" | "PO_AND_PDC";
export type MixDesignType = "DESIGN_MIX" | "NOMINAL_MIX";
export type DispatchStatus = "DISPATCHED" | "RETURNED" | "SITE_ACCEPTED" | "SITE_REJECTED";
export type CastingType = "PUMP" | "DUMP";
export type GstVerificationStatus = "NOT_PROVIDED" | "PENDING_ACCOUNTS" | "VERIFIED" | "REJECTED";
export type PumpDispatchStatus = "NOT_DISPATCHED" | "DISPATCHED";
export type DispatchDocumentMode = "CHALLAN_ONLY" | "CHALLAN_AND_INVOICE" | "CHALLAN_AND_GST_E_INVOICE";
export type DispatchInvoiceStatus = "NOT_REQUESTED" | "REQUESTED" | "POSTED" | "E_INVOICE_GENERATED";
export type CommissionVoucherStatus = "DRAFT" | "APPROVED" | "EXPORTED_TO_TALLY";
export type LedgerEntryType = "DEBIT" | "CREDIT";
export type LedgerPaymentMode = "CASH" | "CHEQUE" | "NEFT" | "UPI" | "AUTO_DISPATCH" | "ADVANCE_RECEIPT";
export type OdooSyncStatus = "NOT_REQUIRED" | "PENDING" | "SYNCED" | "FAILED" | "SKIPPED";
export type DocumentTemplateType = "QUOTATION" | "CHALLAN" | "INVOICE";
export type DocumentTemplateStatus = "ACTIVE" | "INACTIVE";
export type CommissionRecipientType = "SALES_AGENT" | "THIRD_PARTY";
export type RequestPriority = "NORMAL" | "URGENT";
export type SalesOrderRequestStatus =
  | "PENDING_FINANCE"
  | "FINANCE_VERIFIED"
  | "FINANCE_REJECTED"
  | "SCHEDULE_PENDING"
  | "SCHEDULE_APPROVED"
  | "SCHEDULE_REJECTED";
export type ReimbursementClaimStatus =
  | "CLAIM_REQUESTED"
  | "MANAGER_VERIFIED"
  | "ACCOUNTS_PAYMENT_PENDING"
  | "CASH_VOUCHER_CREATED"
  | "OTP_SENT"
  | "AGENT_RECEIPT_CONFIRMED"
  | "PAID"
  | "PARTIAL_PAYMENT"
  | "BALANCE_OUTSTANDING"
  | "PAYMENT_HOLD"
  | "PAYMENT_REJECTED"
  // Legacy statuses kept so old local/Firebase data can normalize safely.
  | "REQUESTED"
  | "REJECTED";
export type ReimbursementPaymentMode = "CASH" | "CHEQUE" | "NEFT" | "UPI" | "BANK_TRANSFER";
export type ReimbursementAdjustmentType = "EXTRA_PAYABLE" | "RECOVERY";
export type ReimbursementAdjustmentStatus = "PENDING_ACCOUNTING_APPROVAL" | "APPROVED" | "REJECTED" | "SETTLED";
export type PaymentVerificationMode = "CASH" | "CHEQUE" | "NEFT" | "UPI" | "BANK_TRANSFER";
export type LedgerDecisionStatus =
  | "GST_CLIENT_ODOO_LEDGER"
  | "NON_GST_INTERNAL_LEDGER"
  | "GST_MATCH_FOUND"
  | "GST_NO_MATCH"
  | "LINK_EXISTING_LEDGER"
  | "CREATE_NEW_SITE"
  | "CREATE_NEW_LEDGER";
export type PoPdcExceptionStatus = "NOT_REQUIRED" | "REQUIRED" | "REQUESTED" | "APPROVED" | "REJECTED";
export type CreditRiskCategory = CreditRisk;
export type StakeholderRole =
  | "SITE_SUPERVISOR"
  | "SITE_ENGINEER"
  | "CONTRACTOR"
  | "OWNER_BUILDER"
  | "PROJECT_MANAGER"
  | "PURCHASE_HEAD"
  | "OTHERS"
  | "FOUND_NO_ONE";
export type ExpectedSupplyWindow = "WITHIN_7_DAYS" | "WITHIN_15_DAYS" | "WITHIN_30_DAYS" | "MORE_THAN_30_DAYS";
export type SiteLocationVerificationStatus = "NOT_APPLICABLE" | "MATCHED" | "OUT_OF_RANGE" | "PHOTO_COORDS_MISSING" | "SAVED_COORDS_MISSING";
// MOD-024/025: Quotation revision/correction tracking
export type QuotationCorrectionStatus = "NONE" | "CORRECTION_REQUESTED" | "CORRECTED";
// MOD-027: Sales Order Request extended statuses
export type SalesOrderRequestFinanceRejectionReason =
  | "PO_MISSING"
  | "GST_INVALID"
  | "CREDIT_EXCEEDED"
  | "PAYMENT_NOT_RECEIVED"
  | "DUPLICATE_REQUEST"
  | "INCOMPLETE_DETAILS"
  | "OTHER";
// MOD-028: Sales order internal reference pattern
export type SalesOrderRevisionType = "NEW" | "SCHEDULE" | "REVISION" | "CANCELLATION";
// MOD-029: Order fulfillment status
export type OrderFulfillmentStatus = "OPEN" | "PARTIALLY_FULFILLED" | "FULLY_FULFILLED" | "CANCELLED";
// MOD-030: Map pin color used by agent lead map
export type MapPinColor = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "GRAY" | "BLUE";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  employeeId: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  homePlantId: string | null;
  email: string | null;
  passwordHash: string;
  lastReimbursementClosedDate?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface WorkdaySession {
  id: string;
  userId: string;
  plantId: string;
  date: string;
  loginAt: string;
  logoutAt: string | null;
  loginLatLng: LatLng | null;
  logoutLatLng: LatLng | null;
  status: SessionStatus;
}

export interface OdometerReading {
  id: string;
  sessionId: string;
  type: ReadingType;
  photoUrl: string;
  originalFileName: string;
  capturedAt: string;
  capturedLatLng: LatLng | null;
  ocrValue: number | null;
  finalValue: number | null;
  ocrConfidence: number | null;
  status: ReadingStatus;
  verifiedBy: string | null;
  verificationNote: string | null;
  // MOD-001: Agent manual reading entry + OCR comparison
  agentEnteredReading?: number | null;
  readingDifference?: number | null;
  managerFinalReading?: number | null;
  // MOD-001: Discard flow — old uploads are never deleted, just marked discarded
  discardedAt?: string | null;
  discardedBy?: string | null;
  discardReason?: OdometerDiscardReason | null;
  discardNote?: string | null;
  replacedByReadingId?: string | null;
  replacesReadingId?: string | null;
  // MOD-002: GPS watermark metadata
  gpsWatermarkText?: string | null;
  gpsCapturedDate?: string | null;
  gpsCapturedLocation?: string | null;
  gpsAccuracy?: number | null;
  // MOD-003: Upload metadata & audit
  uploadedBy?: string | null;
  uploadDateTime?: string | null;
  uploadSource?: OdometerUploadSource;
  fileSizeBytes?: number | null;
  // MOD-004: Duplicate image detection
  imageHash?: string | null;
  duplicateOfReadingId?: string | null;
  duplicateWarningAcknowledgedBy?: string | null;
  duplicateWarningAcknowledgedAt?: string | null;
  // MOD-005: Uniqueness — only one accepted START and END per agent per day
  isActiveReading?: boolean;
  // MOD-010: Correction versioning
  correctionVersion?: number;
  previousReadingValue?: number | null;
  correctionReason?: string | null;
  correctionApprovedBy?: string | null;
  correctionApprovedAt?: string | null;
  // MOD-011: Watermark/GPS missing status
  hasGpsWatermark?: boolean;
  watermarkStatus?: "PRESENT" | "MISSING" | "UNREADABLE";
  // MOD-012: Continuity check result
  continuityStatus?: OdometerContinuityStatus;
  continuityNote?: string | null;
  // MOD-013: Manager review reason
  reviewReason?: string | null;
  managerReviewRequiredAt?: string | null;
  managerReviewedAt?: string | null;
  managerRemark?: string | null;
  lockStatus?: OdometerLockStatus;
  reopenedForCorrectionBy?: string | null;
  reopenedForCorrectionAt?: string | null;
  reopenedForCorrectionReason?: string | null;
}

export interface StakeholderContact {
  label: string;
  name: string;
  phone: string;
  role?: StakeholderRole;
  // MOD-021/023: Phone verification
  phoneVerificationStatus?: PhoneVerificationStatus;
  phoneVerifiedAt?: string | null;
  // MOD-023: Stakeholder master link
  stakeholderMasterId?: string | null;
  // MOD-021: Contact presence
  contactPresence?: ContactPresenceStatus;
}

export interface ContactVerificationEvent {
  id: string;
  stakeholderMasterId: string;
  leadId: string | null;
  siteId: string | null;
  phone: string;
  channel: ContactVerificationChannel;
  provider: string;
  status: ContactVerificationStatus;
  providerMessageId: string | null;
  error: string | null;
  requestedBy: string;
  requestedAt: string;
  verifiedAt: string | null;
  metadata?: Record<string, unknown>;
}

export interface LeadSite {
  id: string;
  leadId: string;
  plantId: string;
  siteName: string;
  siteAddress: string;
  latLng: LatLng | null;
  stakeholders: StakeholderContact[];
  currentSupplier: string;
  expectedSupplyWindow: ExpectedSupplyWindow | null;
  futureScope: string;
  currentConcreteGrade: string;
  currentQuantityCum: number;
  score: number;
  createdAt: string;
  updatedAt: string;
  lastVisitedAt: string;
  // MOD-022: Site-level status management
  siteStatus?: SiteStatus;
  closureReason?: string | null;
  closureRemarks?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  closureApprovedBy?: string | null;
  closureApprovedAt?: string | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
  reopenReason?: string | null;
  // MOD-022: Merged site tracking
  mergedIntoSiteId?: string | null;
  // MOD-020: Get directions link
  directionsLastUsedAt?: string | null;
  directionsUsageCount?: number;
  lastDirectionsUsedBy?: string | null;
}

export interface SiteVisit {
  id: string;
  sessionId: string;
  leadId: string;
  siteId?: string | null;
  plantId: string;
  siteName: string;
  siteAddress: string;
  arrivalPhotoUrl: string;
  visitedAt: string;
  latLng: LatLng | null;
  detectedLatLng?: LatLng | null;
  stakeholders: StakeholderContact[];
  concreteGrade: string;
  quantityCum: number;
  stageOfWork: string;
  futureScope: string;
  currentSupplier: string;
  expectedSupplyWindow?: ExpectedSupplyWindow | null;
  priceExpectation: string;
  score: number;
  leadStage: LeadStage;
  nextFollowUpAt: string;
  remarksText?: string;
  remarksVoiceNoteUrl?: string | null;
  photoWatermarkAddress?: string | null;
  locationVerificationStatus?: SiteLocationVerificationStatus;
  locationVerificationDistanceMeters?: number | null;
  // MOD-015: Captured date mapping — visit date from GPS, not upload date
  capturedDate?: string | null;
  uploadDate?: string | null;
  isLateSync?: boolean;
  // MOD-016: GPS review status
  gpsReviewStatus?: "AUTO_APPROVED" | "PENDING_REVIEW" | "MANAGER_APPROVED" | "MANAGER_REJECTED";
  gpsReviewNote?: string | null;
  gpsReviewedBy?: string | null;
  gpsReviewedAt?: string | null;
  // MOD-017: Active visit tracking
  activeVisitStatus?: ActiveVisitStatus;
  visitStartedAt?: string | null;
  visitCompletedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  // MOD-018: Duplicate detection
  duplicateMatchStrength?: DuplicateMatchStrength;
  duplicateMatchedSiteId?: string | null;
  duplicateOverrideReason?: string | null;
  // MOD-018: Visit productivity tag
  productivityTag?: VisitProductivityTag;
  // MOD-018: Photo reuse detection
  arrivalPhotoHash?: string | null;
  isPhotoReused?: boolean;
  // MOD-019: Edit audit trail
  editHistory?: VisitEditHistoryEntry[];
  // MOD-021: Contact presence
  contactPresenceStatus?: ContactPresenceStatus;
  // MOD-018: Follow-up task auto-creation
  followUpTaskId?: string | null;
  managerReviewRequired?: boolean;
  managerReviewReason?: string | null;
}

export interface Lead {
  id: string;
  agentId: string;
  plantId: string;
  siteName: string;
  siteAddress: string;
  score: number;
  stage: LeadStage;
  nextFollowUpAt: string;
  lastVisitedAt: string;
  currentSupplier: string;
  priceExpectation: string;
  futureScope: string;
  contractorName: string;
  builderName: string;
  supervisorName: string;
  supervisorPhone: string;
  currentConcreteGrade: string;
  currentQuantityCum: number;
  primarySiteId?: string | null;
  primarySiteLatLng?: LatLng | null;
  siteCount?: number;
  // MOD-019/022: Lead closure
  closureReason?: string | null;
  closureRemarks?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  closureApprovedBy?: string | null;
  closureApprovedAt?: string | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
  reopenReason?: string | null;
  closureStatus?: "OPEN" | "PENDING_MANAGER_APPROVAL" | "APPROVED_CLOSED" | "REJECTED";
  closureRequestedBy?: string | null;
  closureRequestedAt?: string | null;
}

export interface ApprovalRequestItem {
  id: string;
  grade: string;
  quotedPrice: number;
}

export interface ApprovalRequest {
  id: string;
  leadId: string;
  siteId: string | null;
  plantId: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  items: ApprovalRequestItem[];
  mixDesignType: MixDesignType;
  grade: string;
  quantity: number;
  requiredDate: string;
  oneWayDistanceKm: number;
  distanceFromPlantKm: number;
  trafficCount: number;
  castingType: string;
  paymentType: PaymentType;
  paymentTerms: PaymentTerms;
  quotedPrice: number;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdBy: string;
  createdAt: string;
  linkedQuotationId?: string | null;
  linkedQuotationRevisionId?: string | null;
  quotationValidityStatus?: "VALID" | "EXPIRED" | "NOT_LINKED";
  directFinalApprovalReason?: string | null;
  routeFeasibilityStatus?: "FEASIBLE" | "MARGINAL" | "NOT_FEASIBLE" | "NOT_CHECKED";
  variationNotes?: string | null;
  minimumRatePerCum?: number | null;
  rateValidationStatus?: "VALID" | "BELOW_MINIMUM" | "OVERRIDE_APPROVED" | "NOT_CHECKED";
  finalApprovalRecordId?: string | null;
}

export interface InformalQuotationLineItem {
  id: string;
  grade: string;
  quantityCum: number;
  mixDesignType: MixDesignType;
  mixRequirement: string;
  pricePerCum: number;
}

export interface InformalQuotationRequest {
  id: string;
  leadId: string;
  siteId: string;
  plantId: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  stakeholderRole: StakeholderRole;
  stakeholderLabel: string;
  stakeholderName: string;
  stakeholderPhone: string;
  stakeholderEmail: string;
  billingAddress: string;
  whatsappNumber: string;
  priceType: InformalQuotationPriceType;
  paymentType: InformalQuotationPaymentType;
  creditDays: number | null;
  oneWayDistanceKm: number;
  trafficPostCount: number;
  items: InformalQuotationLineItem[];
  status: InformalQuotationStatus;
  decisionNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  quotationRef: string | null;
  quotationPdfUrl: string | null;
  quotationPdfS3Key: string | null;
  pdfStatus: InformalQuotationPdfStatus;
  pdfGeneratedAt: string | null;
  pdfError: string | null;
  emailStatus: InformalQuotationEmailStatus;
  emailSentAt: string | null;
  emailError: string | null;
  emailTo: string | null;
  emailCc: string[];
  whatsappStatus: InformalQuotationWhatsappStatus;
  whatsappSentAt: string | null;
  whatsappError: string | null;
  createdBy: string;
  createdAt: string;
  // MOD-024: Pre-eligibility & validation
  eligibilityChecked?: boolean;
  rateValidationStatus?: "VALID" | "BELOW_MINIMUM" | "OVERRIDE_APPROVED" | "NOT_CHECKED";
  rateValidationNote?: string | null;
  minimumRatePerCum?: number | null;
  // MOD-024: Duplicate quotation detection
  duplicateOfQuotationId?: string | null;
  // MOD-025: Versioning
  revisionNumber?: number;
  previousRevisionId?: string | null;
  latestRevisionId?: string | null;
  validityDate?: string | null;
  isExpired?: boolean;
  // MOD-025: Correction flow
  correctionStatus?: QuotationCorrectionStatus;
  correctionReason?: string | null;
  correctionRequestedBy?: string | null;
  correctionRequestedAt?: string | null;
  // MOD-025: Credit payment terms
  creditApprovalRequired?: boolean;
  creditApprovedBy?: string | null;
  creditApprovedAt?: string | null;
  // MOD-025: Delivery channel audit
  deliveryChannels?: Array<{ channel: string; sentAt: string; sentBy: string }>;
}

export interface Task {
  id: string;
  plantId: string;
  subject: string;
  explanation: string;
  deadline: string;
  status: TaskStatus;
  assignedTo: string;
  assignedBy: string;
}

export interface HelpRequest {
  id: string;
  agentId: string;
  plantId: string;
  sessionDate: string;
  requestedField: string;
  explanation: string;
  status: HelpRequestStatus;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface Target {
  id: string;
  userId: string;
  month: string;
  quantityTarget: number;
}

export interface Plant {
  id: string;
  code: string;
  name: string;
  unitName: string;
  region: string;
  status: PlantStatus;
  monthlyVolumeTarget: number;
  currentActiveSitesTarget: number;
}

export interface FleetVehicle {
  id: string;
  plantId: string;
  vehicleCode: string;
  driverName: string;
  capacityCum: number;
  status: FleetVehicleStatus;
  deliveriesToday: number;
  onTimeRate: number;
  lastDispatchAt: string | null;
}

export interface MaterialCostSnapshot {
  id: string;
  plantId: string;
  effectiveAt: string;
  cementPerTon: number;
  ggbsPerTon: number;
  flyAshPerTon: number;
  aggregatePerTon: number;
  sandPerTon: number;
  dieselPerLitre: number;
}

export interface PlantPriceBenchmark {
  id: string;
  plantId: string;
  grade: string;
  sellingPricePerCum: number;
}

export interface CustomerAccount {
  id: string;
  plantId: string;
  customerName: string;
  odooPartnerId: number | null;
  whatsappNumber: string;
  creditLimit: number;
  creditPeriodDays: number;
  outstandingAmount: number;
  activeOrderExposure?: number;
  overdueAmount?: number;
  riskLevel: CreditRisk;
  lastPaymentAt: string | null;
  creditApprovalHistory?: CreditApprovalHistoryEntry[];
}

export interface CustomerInvoice {
  id: string;
  plantId: string;
  accountId: string;
  invoiceNumber: string;
  amount: number;
  issuedAt: string;
  dueAt: string;
  status: InvoiceStatus;
  paidAt: string | null;
}

export interface DocumentTemplate {
  id: string;
  type: DocumentTemplateType;
  name: string;
  fileUrl: string;
  fileMimeType: string;
  originalFileName: string;
  status: DocumentTemplateStatus;
  uploadedBy: string;
  uploadedAt: string;
}

/** A single debit or credit entry in a customer's unified ledger. */
export interface CustomerLedgerEntry {
  id: string;
  customerName: string;
  type: LedgerEntryType;
  amount: number;
  runningBalance: number;
  description: string;
  referenceId: string | null;
  paymentMode: LedgerPaymentMode;
  createdBy: string;
  createdAt: string;
}

export interface SalesOrderRequest {
  id: string;
  leadId: string;
  siteId: string | null;
  approvalRequestId: string | null;
  plantId: string;
  customerName: string;
  siteName: string;
  grade: string;
  approvedPrice: number;
  quantity: number;
  /** Tracks remaining cum to be dispatched. Initialized to quantity, decremented atomically on each dispatch. */
  remainingQuantity: number;
  amount: number;
  siteAddress: string;
  oneWayDistanceKm: number;
  trafficCount: number;
  paymentType: PaymentType;
  paymentTerms: PaymentTerms;
  mixDesignType: MixDesignType;
  /** FK to MixDesign.id — links the order to a specific recipe for material auditing. */
  mixDesignId: string | null;
  slump: string;
  receiverName: string;
  receiverPhone: string;
  poDocumentUrl: string | null;
  pdcDocumentUrl: string | null;
  gstin: string | null;
  gstPan: string | null;
  gstLegalName: string | null;
  gstBillingAddress: string | null;
  gstCertificateUrl: string | null;
  gstVerificationStatus: GstVerificationStatus;
  gstVerifiedBy: string | null;
  gstVerifiedAt: string | null;
  gstVerificationNote: string | null;
  agentGstConfirmedAt: string | null;
  odooPartnerId: number | null;
  odooLedgerSyncStatus: OdooSyncStatus;
  odooLedgerSyncError: string | null;
  odooLedgerSyncedAt: string | null;
  odooSaleOrderId: number | null;
  odooSaleOrderName: string | null;
  odooSalesOrderSyncStatus: OdooSyncStatus;
  odooSalesOrderSyncError: string | null;
  odooSalesOrderSyncedAt: string | null;
  shippingAddress: string;
  plannedCastingType: CastingType;
  actualCastingType: CastingType;
  pumpDispatchStatus: PumpDispatchStatus;
  pumpDispatchedBy: string | null;
  pumpDispatchedAt: string | null;
  pumpVehicleNumber: string | null;
  pumpOperatorName: string | null;
  pumpOperatorPhone: string | null;
  pumpDispatchNote: string | null;
  paymentReceivedConfirmed: boolean;
  financeChecklist?: FinanceVerificationChecklist | null;
  manualPaymentVerification?: ManualPaymentVerification | null;
  ledgerDecisionStatus?: LedgerDecisionStatus | null;
  linkedLedgerCustomerName?: string | null;
  duplicateLedgerConfidence?: number | null;
  poPdcExceptionStatus?: PoPdcExceptionStatus;
  poPdcExceptionReason?: string | null;
  poPdcExceptionRequestedBy?: string | null;
  poPdcExceptionRequestedAt?: string | null;
  poPdcExceptionDecidedBy?: string | null;
  poPdcExceptionDecidedAt?: string | null;
  creditRiskCategory?: CreditRiskCategory;
  creditLimitAmount?: number | null;
  creditPeriodDays?: number | null;
  creditOverrideApprovedBy?: string | null;
  creditOverrideApprovedAt?: string | null;
  creditOverrideExpiresAt?: string | null;
  creditOverrideAmountLimit?: number | null;
  creditOverrideReason?: string | null;
  salesOrderFinalChecklist?: SalesOrderFinalChecklist | null;
  salesOrderPreviewConfirmedBy?: string | null;
  salesOrderPreviewConfirmedAt?: string | null;
  salesOrderPreviewHash?: string | null;
  salesOrderCopyUrl?: string | null;
  requiredDate: string;
  pumpRequired: boolean;
  priority: RequestPriority;
  notes: string;
  status: SalesOrderRequestStatus;
  financeReviewedBy: string | null;
  financeReviewedAt: string | null;
  financeNote: string | null;
  scheduleDateTime: string | null;
  scheduleReceiverName: string | null;
  scheduleReceiverPhone: string | null;
  scheduleRequestedAt: string | null;
  scheduleDecidedBy: string | null;
  scheduleDecidedAt: string | null;
  scheduleNote: string | null;
  createdBy: string;
  createdAt: string;
  // MOD-027: Sales Order Request improvements
  sorNumber?: string | null;
  isDuplicateRequest?: boolean;
  duplicateOfOrderId?: string | null;
  financeRejectionReason?: SalesOrderRequestFinanceRejectionReason | null;
  financeRejectionHistory?: Array<{ reason: SalesOrderRequestFinanceRejectionReason; note: string; rejectedBy: string; rejectedAt: string }>;
  correctionResubmittedAt?: string | null;
  correctionResubmittedBy?: string | null;
  odooPreflight?: "PENDING" | "READY" | "FAILED" | "MANUAL_FALLBACK";
  odooPreflightError?: string | null;
  preliminaryMixDesignStatus?: "NOT_REQUIRED" | "PENDING" | "READY" | "NOT_AVAILABLE";
  postFinanceLocked?: boolean;
  postFinanceLockedAt?: string | null;
  // MOD-028: Sales Order Management
  internalReference?: string | null;
  revisionType?: SalesOrderRevisionType;
  deliveryDateValidated?: boolean;
  isUrgent?: boolean;
  urgentReason?: string | null;
  receiverPhoneValidated?: boolean;
  plantLockedAt?: string | null;
  plantChangeApprovedBy?: string | null;
  plantChangeReason?: string | null;
  orderQuantity?: number;
  attachmentVersions?: Array<{ url: string; version: number; uploadedAt: string; uploadedBy: string; superseded: boolean }>;
  // MOD-029: Order continuity & fulfillment
  fulfillmentStatus?: OrderFulfillmentStatus;
  isOpenVolume?: boolean;
  parentOrderId?: string | null;
  childOrderIds?: string[];
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  editHistory?: Array<{ field: string; oldValue: string; newValue: string; changedBy: string; changedAt: string; reason: string }>;
}

/** Recipe for a concrete grade. One grade can have multiple versions per plant. */
export interface MixDesign {
  id: string;
  plantId: string;
  grade: string;                    // e.g. "M25", "M30"
  version: number;                  // Incremented on each update, latest version is active
  isActive: boolean;
  mixDesignType: MixDesignType;
  targetSlumpMm: number;
  // Material quantities in kg per cubic meter (cum)
  cementKgPerCum: number;
  ggbsKgPerCum: number;
  flyAshKgPerCum: number;
  sandKgPerCum: number;
  aggregate10mmKgPerCum: number;
  aggregate20mmKgPerCum: number;
  admixtureKgPerCum: number;
  waterLitresPerCum: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Records each truck dispatch against a SalesOrderRequest. */
export interface DispatchRecord {
  id: string;
  orderId: string;
  plantId: string;
  vehicleId: string;
  vehicleCode: string;
  driverName: string;
  driverPhone: string;
  challanNumber: string;
  documentMode: DispatchDocumentMode;
  invoiceStatus: DispatchInvoiceStatus;
  invoiceNumber: string | null;
  eInvoiceIrn: string | null;
  actualCastingType: CastingType;
  gstin: string | null;
  pumpDispatchStatus: PumpDispatchStatus;
  dispatchedQuantityCum: number;
  returnedQuantityCum: number;      // Non-zero if truck returned with leftover concrete
  finalSuppliedCum: number;         // dispatchedQuantityCum - returnedQuantityCum
  status: DispatchStatus;
  dispatchedAt: string;
  siteAcceptedAt: string | null;
  siteRejectedAt: string | null;
  // E-Way Bill data (populated after GSP API call)
  ewayBillNumber: string | null;
  ewayBillGeneratedAt: string | null;
  // Material consumption (auto-calculated from MixDesign x dispatchedQuantityCum)
  theoreticalCementKg: number | null;
  theoreticalGgbsKg: number | null;
  theoreticalFlyAshKg: number | null;
  theoreticalSandKg: number | null;
  theoreticalAggregate10mmKg: number | null;
  theoreticalAggregate20mmKg: number | null;
  theoreticalAdmixtureKg: number | null;
  theoreticalWaterLitres: number | null;
  createdBy: string;
  createdAt: string;
}

/** Commission voucher — manually created by Accounts Head. */
export interface CommissionVoucher {
  id: string;
  plantId: string;
  brokerName: string;
  siteName: string;
  quantityCum: number;
  ratePerCum: number;
  totalCommission: number;
  status: CommissionVoucherStatus;
  createdBy: string;               // Must be ACCOUNTING role
  createdAt: string;
  exportedAt: string | null;
}

export interface ReimbursementClaimLine {
  sessionId: string;
  date: string;
  startReading: number;
  endReading: number;
  distanceKm: number;
  siteVisits: number;
  fuelAmount: number;
  lunchAmount: number;
  totalAmount: number;
}

export interface ReimbursementPaymentHistoryEntry {
  id: string;
  amount: number;
  balanceAmount: number;
  outstandingAmount: number;
  paymentMode: ReimbursementPaymentMode;
  cashVoucherNumber: string | null;
  referenceNumber: string | null;
  remarks: string;
  paidBy: string;
  paidAt: string;
}

export interface ReimbursementClaim {
  id: string;
  agentId: string;
  requestedBy: string;
  status: ReimbursementClaimStatus;
  periodStart: string;
  periodEnd: string;
  lineItems: ReimbursementClaimLine[];
  totalDistanceKm: number;
  fuelAmount: number;
  lunchAmount: number;
  totalAmount: number;
  approvedAmount?: number;
  paidAmount?: number;
  balanceAmount?: number;
  outstandingAmount?: number;
  requestedAt: string;
  managerVerifiedBy?: string | null;
  managerVerifiedAt?: string | null;
  managerVerificationNote?: string | null;
  accountsPaymentPendingAt?: string | null;
  cashVoucherNumber?: string | null;
  cashVoucherCreatedAt?: string | null;
  cashVoucherCreatedBy?: string | null;
  cashVoucherAmount?: number | null;
  otpCode: string | null;
  otpSentAt: string | null;
  otpExpiresAt: string | null;
  otpVerifiedAt: string | null;
  agentReceiptConfirmedAt?: string | null;
  paidAt: string | null;
  paidBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  accountantRemarks?: string | null;
  paymentMode?: ReimbursementPaymentMode | null;
  paymentHistory?: ReimbursementPaymentHistoryEntry[];
  note: string | null;
}

export interface ReimbursementAdjustmentEntry {
  id: string;
  agentId: string;
  workdayDate: string;
  originalClaimId: string;
  correctionRequestId: string;
  readingId: string;
  readingType: ReadingType;
  originalDistanceKm: number;
  correctedDistanceKm: number;
  distanceDifferenceKm: number;
  originalAmount: number;
  correctedAmount: number;
  adjustmentAmount: number;
  adjustmentType: ReimbursementAdjustmentType;
  status: ReimbursementAdjustmentStatus;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  settledInClaimId: string | null;
  settledBy: string | null;
  settledAt: string | null;
  remark: string | null;
}

export interface FinanceVerificationChecklist {
  gstChecked: boolean;
  gstCertificateChecked: boolean;
  legalNameChecked: boolean;
  billingAddressChecked: boolean;
  poChecked: boolean;
  pdcChecked: boolean;
  paymentProofChecked: boolean;
  amountReceivedChecked: boolean;
  outstandingChecked: boolean;
  overdueChecked: boolean;
  creditLimitChecked: boolean;
  accountantRemarks: string;
  verifiedBy: string;
  verifiedAt: string;
}

export interface ManualPaymentVerification {
  amountReceived: number;
  paymentMode: PaymentVerificationMode;
  utrNumber: string | null;
  chequeNumber: string | null;
  cashVoucherNumber: string | null;
  paymentDate: string;
  paymentProofUrl: string | null;
  bankCashAccount: string;
  verifiedBy: string;
  verifiedAt: string;
  differenceFromRequiredAmount: number;
}

export interface SalesOrderFinalChecklist {
  gradeConfirmed: boolean;
  quantityConfirmed: boolean;
  rateConfirmed: boolean;
  paymentTermsConfirmed: boolean;
  requiredDateTimeConfirmed: boolean;
  castingTypeConfirmed: boolean;
  pumpDumpRequirementConfirmed: boolean;
  receiverConfirmed: boolean;
  phoneConfirmed: boolean;
  deliveryAddressConfirmed: boolean;
  plantConfirmed: boolean;
  taxChallanModeConfirmed: boolean;
  accountantRemarks: string;
  verifiedBy: string;
  verifiedAt: string;
}

export interface CreditApprovalHistoryEntry {
  id: string;
  creditLimitAmount: number;
  creditPeriodDays: number;
  riskCategory: CreditRiskCategory;
  reason: string;
  approvedBy: string;
  approvedAt: string;
  temporaryExceptionExpiresAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: UserRole;
  entityType: string;
  entityId: string;
  action: string;
  detail: string;
  createdAt: string;
}

// MOD-019: Visit edit audit trail entry
export interface VisitEditHistoryEntry {
  id: string;
  field: VisitEditType;
  oldValue: string;
  newValue: string;
  editedBy: string;
  editedAt: string;
  reason: string;
}

// MOD-010: Odometer correction history entry
export interface OdometerCorrectionEntry {
  id: string;
  readingId: string;
  version: number;
  type: OdometerCorrectionType;
  oldValue: number | null;
  newValue: number | null;
  reason: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdAt: string;
  linkedClaimId: string | null;
  dateKey?: string | null;
  status?: "PENDING_MANAGER_REOPEN" | "REOPENED" | "APPLIED" | "REJECTED";
  // MOD-009 / MOD-012: Scoped reopen and correction audit
  agentId?: string | null;
  workdayDate?: string | null;
  readingType?: ReadingType | null;

  reopenScope?: "SINGLE_DATE_SINGLE_TYPE" | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;

  oldStartReadingId?: string | null;
  oldEndReadingId?: string | null;
  oldStartValue?: number | null;
  oldEndValue?: number | null;

  selectedReadingId?: string | null;
  newReadingId?: string | null;
}

// MOD-013: Agent daily travel summary (computed, not stored)
export interface OdometerDaySummary {
  date: string;
  agentId: string;
  agentName: string;
  startReading: number | null;
  endReading: number | null;
  totalKm: number | null;
  siteVisits: number;
  dayStatus: OdometerDayStatus;
  continuityStatus: OdometerContinuityStatus;
  missingProofs: string[];
  corrections: number;
  claimStatus: string | null;
  hasLateUpload: boolean;
}

// MOD-023: Stakeholder master profile — one person across multiple sites
export interface StakeholderMaster {
  id: string;
  name: string;
  phone: string;
  role: StakeholderRole;
  phoneVerificationStatus: PhoneVerificationStatus;
  phoneVerifiedAt: string | null;
  lastCallVerificationAt?: string | null;
  lastWhatsappVerificationAt?: string | null;
  lastVerificationError?: string | null;
  linkedSiteIds: string[];
  linkedLeadIds: string[];
  billingResponsibility: "CONTRACTOR" | "BUILDER" | "OWNER" | "NOT_SET";
  materialScope: string;
  gstin: string | null;
  pan: string | null;
  billingAddress: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// MOD-025: Quotation revision record
export interface QuotationRevision {
  id: string;
  quotationId: string;
  revisionNumber: number;
  correctionStatus: QuotationCorrectionStatus;
  correctionReason: string | null;
  correctionRequestedBy: string | null;
  correctionRequestedAt: string | null;
  previousRevisionId: string | null;
  createdBy: string;
  createdAt: string;
}

// MOD-026: Final approval record
export interface FinalApprovalRecord {
  id: string;
  quotationId: string;
  quotationRevisionId: string | null;
  siteId: string;
  leadId: string;
  status: FinalApprovalStatus;
  creditApprovalStatus: "PENDING" | "APPROVED" | "REJECTED" | "NOT_REQUIRED";
  variationNotes: string | null;
  distanceKm: number;
  routeFeasibilityStatus: "FEASIBLE" | "MARGINAL" | "NOT_FEASIBLE" | "NOT_CHECKED";
  materialScope: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  lockedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SiteMapMarker {
  siteId: string;
  leadId: string;
  plantId: string;
  siteName: string;
  siteAddress: string;
  siteStatus: SiteStatus;
  leadStage: LeadStage;
  pinColor: MapPinColor;
  latLng: LatLng | null;
  stakeholderMasterId: string | null;
  stakeholderName: string | null;
  stakeholderPhone: string | null;
  phoneVerificationStatus: PhoneVerificationStatus | null;
  grade: string;
  quantityCum: number;
  lastVisitedAt: string;
  missingLocation: boolean;
  locationCorrectionRequired?: boolean;
  locationCorrectionReason?: string | null;
  directionsUsageCount?: number;
  directionsLastUsedAt?: string | null;
}

export interface Database {
  users: User[];
  authSessions: AuthSession[];
  plants: Plant[];
  workdaySessions: WorkdaySession[];
  odometerReadings: OdometerReading[];
  siteVisits: SiteVisit[];
  leads: Lead[];
  leadSites: LeadSite[];
  approvalRequests: ApprovalRequest[];
  informalQuotationRequests: InformalQuotationRequest[];
  tasks: Task[];
  helpRequests: HelpRequest[];
  targets: Target[];
  auditLogs: AuditLogEntry[];
  fleetVehicles: FleetVehicle[];
  materialCostSnapshots: MaterialCostSnapshot[];
  priceBenchmarks: PlantPriceBenchmark[];
  customerAccounts: CustomerAccount[];
  customerInvoices: CustomerInvoice[];
  documentTemplates: DocumentTemplate[];
  salesOrderRequests: SalesOrderRequest[];
  reimbursementClaims: ReimbursementClaim[];
  reimbursementAdjustments: ReimbursementAdjustmentEntry[];
  // RMC Phase 1 additions
  mixDesigns: MixDesign[];
  dispatchRecords: DispatchRecord[];
  commissionVouchers: CommissionVoucher[];
  customerLedgerEntries: CustomerLedgerEntry[];
  // MOD additions
  contactVerificationEvents: ContactVerificationEvent[];
  stakeholderMasters: StakeholderMaster[];
  odometerCorrections: OdometerCorrectionEntry[];
  quotationRevisions: QuotationRevision[];
  finalApprovals: FinalApprovalRecord[];
}

export interface ReimbursementSummary {
  sessionId: string;
  userId: string;
  agentName: string;
  date: string;
  officeInTime: string;
  siteVisitStartTime: string | null;
  startReading: number | null;
  endReading: number | null;
  siteVisitEndTime: string | null;
  officeOutTime: string | null;
  totalDistance: number | null;
  totalSiteVisits: number;
  lunchAmount: number;
  fuelAmount: number | null;
  totalAmount: number | null;
  claimId: string | null;
  status: "CONFIRMED" | "PENDING" | "MANUAL_VERIFIED" | "OPEN";
}

export interface AgentDashboardData {
  user: User;
  activeSession: WorkdaySession | null;
  readings: OdometerReading[];
  siteVisits: SiteVisit[];
  leads: Lead[];
  leadSites: LeadSite[];
  tasks: Task[];
  approvals: ApprovalRequest[];
  informalQuotationRequests: InformalQuotationRequest[];
  salesOrderRequests: SalesOrderRequest[];
  reimbursementClaims: ReimbursementClaim[];
  reimbursementAdjustments: ReimbursementAdjustmentEntry[];
  targets: Target[];
  helpRequests: HelpRequest[];
  reimbursementSummaries: ReimbursementSummary[];
  siteMapMarkers: SiteMapMarker[];
  pipelineQuantity: number;
  approvedQuantity: number;
}

export interface ManagerDashboardData {
  user: User;
  plants: Plant[];
  odometerReadings: OdometerReading[];
  verificationQueue: OdometerReading[];
  siteVisits: SiteVisit[];
  leadSites: LeadSite[];
  siteMapMarkers: SiteMapMarker[];
  workdaySessions: WorkdaySession[];
  leads: Lead[];
  approvals: ApprovalRequest[];
  informalQuotationRequests: InformalQuotationRequest[];
  salesOrderRequests: SalesOrderRequest[];
  reimbursementClaims: ReimbursementClaim[];
  reimbursementAdjustments: ReimbursementAdjustmentEntry[];
  helpRequests: HelpRequest[];
  tasks: Task[];
  targets: Target[];
  auditLogs: AuditLogEntry[];
  agents: User[];
  fleetVehicles: FleetVehicle[];
  materialCostSnapshots: MaterialCostSnapshot[];
  priceBenchmarks: PlantPriceBenchmark[];
  customerAccounts: CustomerAccount[];
  customerInvoices: CustomerInvoice[];
  documentTemplates: DocumentTemplate[];
}

export interface AccountingDashboardData {
  user: User;
  plants: Plant[];
  reimbursements: ReimbursementSummary[];
  reimbursementClaims: ReimbursementClaim[];
  reimbursementAdjustments: ReimbursementAdjustmentEntry[];
  tasks: Task[];
  approvals: ApprovalRequest[];
  salesOrderRequests: SalesOrderRequest[];
  agents: User[];
  customerAccounts: CustomerAccount[];
  customerLedgerEntries: CustomerLedgerEntry[];
  documentTemplates: DocumentTemplate[];
}

export interface BatcherDashboardData {
  user: User;
  plant: Plant | null;
  activeOrders: SalesOrderRequest[];
  mixDesigns: MixDesign[];
  fleetVehicles: FleetVehicle[];
  dispatchRecords: DispatchRecord[];
}
