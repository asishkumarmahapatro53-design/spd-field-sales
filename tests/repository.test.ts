import { describe, expect, it } from "vitest";
import { computeReimbursementSummaries } from "@/lib/repository";
import { getOcrPromptText, normalizeGeminiReadingValue, OcrService } from "@/lib/ocr";
import type { Database } from "@/lib/types";

const baseDatabase: Database = {
  users: [
    {
      id: "agent-1",
      employeeId: "SA1001",
      name: "Ravi Sharma",
      role: "SALES_AGENT",
      status: "ACTIVE",
      homePlantId: "plant-a",
      passwordHash: "hash",
    },
  ],
  authSessions: [],
  plants: [
    {
      id: "plant-a",
      code: "PLANT_A",
      name: "Plant A",
      region: "North",
      status: "ACTIVE",
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 10,
    },
  ],
  workdaySessions: [
    {
      id: "session-1",
      userId: "agent-1",
      plantId: "plant-a",
      date: "2026-04-20",
      loginAt: "2026-04-20T03:30:00.000Z",
      logoutAt: "2026-04-20T13:30:00.000Z",
      loginLatLng: { lat: 22.5726, lng: 88.3639 },
      logoutLatLng: { lat: 22.5726, lng: 88.3639 },
      status: "CLOSED",
    },
  ],
  odometerReadings: [
    {
      id: "reading-1",
      sessionId: "session-1",
      type: "START",
      photoUrl: "/uploads/start.jpg",
      originalFileName: "start-12000.jpg",
      capturedAt: "2026-04-20T03:40:00.000Z",
      capturedLatLng: null,
      ocrValue: 12000,
      finalValue: 12000,
      ocrConfidence: 0.89,
      status: "CONFIRMED",
      verifiedBy: null,
      verificationNote: null,
    },
    {
      id: "reading-2",
      sessionId: "session-1",
      type: "END",
      photoUrl: "/uploads/end.jpg",
      originalFileName: "end-12048.jpg",
      capturedAt: "2026-04-20T13:00:00.000Z",
      capturedLatLng: null,
      ocrValue: 12048,
      finalValue: 12048,
      ocrConfidence: 0.91,
      status: "CONFIRMED",
      verifiedBy: null,
      verificationNote: null,
    },
  ],
  siteVisits: [
    {
      id: "visit-1",
      sessionId: "session-1",
      leadId: "lead-1",
      plantId: "plant-a",
      siteName: "Metro Residency",
      siteAddress: "Kolkata",
      arrivalPhotoUrl: "/uploads/site.jpg",
      visitedAt: "2026-04-20T06:00:00.000Z",
      latLng: null,
      stakeholders: [],
      concreteGrade: "M25",
      quantityCum: 120,
      stageOfWork: "Slab",
      futureScope: "Tower B",
      currentSupplier: "ABC",
      priceExpectation: "5300",
      score: 8,
      leadStage: "NEGOTIATING",
      nextFollowUpAt: "2026-04-22T05:30:00.000Z",
    },
  ],
  leads: [],
  leadSites: [],
  approvalRequests: [],
  salesOrderRequests: [],
  reimbursementClaims: [],
  tasks: [],
  helpRequests: [],
  targets: [],
  auditLogs: [],
  fleetVehicles: [],
  materialCostSnapshots: [],
  priceBenchmarks: [],
  customerAccounts: [],
  customerInvoices: [],
  mixDesigns: [],
  dispatchRecords: [],
  commissionVouchers: [],
};

describe("computeReimbursementSummaries", () => {
  it("computes total distance and visit counts from confirmed readings", () => {
    const summaries = computeReimbursementSummaries(baseDatabase, "agent-1");

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.startReading).toBe(12000);
    expect(summaries[0]?.endReading).toBe(12048);
    expect(summaries[0]?.totalDistance).toBe(48);
    expect(summaries[0]?.totalSiteVisits).toBe(1);
    expect(summaries[0]?.fuelAmount).toBe(216);
    expect(summaries[0]?.totalAmount).toBe(366);
    expect(summaries[0]?.status).toBe("CONFIRMED");
  });

  it("marks the day as manual verified when any reading was manually overridden", () => {
    const database: Database = {
      ...baseDatabase,
      odometerReadings: baseDatabase.odometerReadings.map((entry, index) =>
        index === 1 ? { ...entry, status: "MANUAL_VERIFIED" } : entry,
      ),
    };

    const summaries = computeReimbursementSummaries(database, "agent-1");
    expect(summaries[0]?.status).toBe("MANUAL_VERIFIED");
  });
});

describe("OcrService", () => {
  it("teaches Gemini how to treat analog decimal wheels", () => {
    const prompt = getOcrPromptText();

    expect(prompt).toContain("treat it as a decimal digit, not a full kilometer digit");
    expect(prompt).toContain('"meter_style":"ANALOG"');
    expect(prompt).toContain('"whole_km_value":26594');
    expect(prompt).toContain('"decimal_tenths":4');
  });

  it("normalizes analog ODO readings from whole kilometers plus tenths digit", () => {
    const result = normalizeGeminiReadingValue({
      kind: "ODO",
      meterStyle: "ANALOG",
      readingValue: 265944,
      wholeKmValue: 26594,
      decimalTenths: 4,
    });

    expect(result.value).toBe(26594.4);
  });

  it("keeps digital ODO readings as whole kilometers", () => {
    const result = normalizeGeminiReadingValue({
      kind: "ODO",
      meterStyle: "DIGITAL",
      readingValue: 35114.4,
      wholeKmValue: 35114,
      decimalTenths: null,
    });

    expect(result.value).toBe(35114);
  });

  it("keeps Gemini decimal output when analog ODO is already correct", () => {
    const result = normalizeGeminiReadingValue({
      kind: "ODO",
      meterStyle: "ANALOG",
      readingValue: 26362.7,
      wholeKmValue: null,
      decimalTenths: null,
    });

    expect(result.value).toBe(26362.7);
  });

  it("extracts a likely odometer number from the file name", async () => {
    const service = new OcrService();
    const result = await service.extractOdometerValue({
      fileName: "odo-15432.jpg",
      localAbsolutePath: null,
      mimeType: "image/jpeg",
    });
    expect(result.value).toBe(15432);
    expect(result.kind).toBe("ODO");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("falls back to manual review when no number is present", async () => {
    const service = new OcrService();
    const result = await service.extractOdometerValue({
      fileName: "dashboard-photo.jpg",
      localAbsolutePath: null,
      mimeType: "image/jpeg",
    });
    expect(result.value).toBeNull();
    expect(result.kind).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("extracts camera timestamp from GPS camera style file names without treating it as the odometer", async () => {
    const service = new OcrService();
    const result = await service.extractOdometerValue({
      fileName: "20260119_111233AMByGPSMapCamera.jpg",
      localAbsolutePath: null,
      mimeType: "image/jpeg",
    });

    expect(result.value).toBeNull();
    expect(result.kind).toBe("UNKNOWN");
    expect(result.capturedAt).toBe("2026-01-19T05:42:33.000Z");
  });

  it("extracts GPS camera timestamps when the time has a single digit hour", async () => {
    const service = new OcrService();
    const result = await service.extractOdometerValue({
      fileName: "20260120_62157PMByGPSMapCamera.jpg",
      localAbsolutePath: null,
      mimeType: "image/jpeg",
    });

    expect(result.value).toBeNull();
    expect(result.kind).toBe("UNKNOWN");
    expect(result.capturedAt).toBe("2026-01-20T12:51:57.000Z");
  });
});
