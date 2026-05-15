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
  | "MANUAL_VERIFIED";
export type LeadStage = "TALKS" | "NEGOTIATING" | "FINALIZED" | "MISSED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type InformalQuotationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type InformalQuotationPriceType = "GST_INCLUSIVE" | "NON_GST";
export type InformalQuotationPaymentType = "ADVANCE" | "CREDIT";
export type InformalQuotationPdfStatus = "NOT_GENERATED" | "GENERATED" | "FAILED";
export type InformalQuotationEmailStatus = "NOT_SENT" | "SENT" | "FAILED";
export type InformalQuotationWhatsappStatus = "NOT_SENT" | "PENDING_CONFIGURATION" | "SENT" | "FAILED";
export type TaskStatus = "OPEN" | "DONE";
export type HelpRequestStatus = "OPEN" | "RESOLVED";
export type FleetVehicleStatus = "ACTIVE" | "IDLE" | "SERVICE" | "OFF_ROUTE";
export type CreditRisk = "LOW" | "MEDIUM" | "HIGH";
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
export type ReimbursementClaimStatus = "REQUESTED" | "OTP_SENT" | "PAID" | "REJECTED";
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
}

export interface StakeholderContact {
  label: string;
  name: string;
  phone: string;
  role?: StakeholderRole;
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
  riskLevel: CreditRisk;
  lastPaymentAt: string | null;
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
  requestedAt: string;
  otpCode: string | null;
  otpSentAt: string | null;
  otpExpiresAt: string | null;
  otpVerifiedAt: string | null;
  paidAt: string | null;
  paidBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  note: string | null;
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
  // RMC Phase 1 additions
  mixDesigns: MixDesign[];
  dispatchRecords: DispatchRecord[];
  commissionVouchers: CommissionVoucher[];
  customerLedgerEntries: CustomerLedgerEntry[];
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
  targets: Target[];
  helpRequests: HelpRequest[];
  reimbursementSummaries: ReimbursementSummary[];
  pipelineQuantity: number;
  approvedQuantity: number;
}

export interface ManagerDashboardData {
  user: User;
  plants: Plant[];
  odometerReadings: OdometerReading[];
  verificationQueue: OdometerReading[];
  siteVisits: SiteVisit[];
  workdaySessions: WorkdaySession[];
  leads: Lead[];
  approvals: ApprovalRequest[];
  informalQuotationRequests: InformalQuotationRequest[];
  salesOrderRequests: SalesOrderRequest[];
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
