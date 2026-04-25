import { describe, expect, it } from "vitest";
import { groupAgentReadings } from "@/lib/agent-dashboard";
import type { OdometerReading } from "@/lib/types";

const readings: OdometerReading[] = [
  {
    id: "reading-1",
    sessionId: "session-1",
    type: "START",
    photoUrl: "/uploads/start.jpg",
    originalFileName: "start.jpg",
    capturedAt: "2026-04-20T10:00:00.000Z",
    capturedLatLng: null,
    ocrValue: 12000,
    finalValue: 12000,
    ocrConfidence: 0.91,
    status: "CONFIRMED",
    verifiedBy: null,
    verificationNote: null,
  },
  {
    id: "reading-2",
    sessionId: "session-1",
    type: "END",
    photoUrl: "/uploads/end.jpg",
    originalFileName: "end.jpg",
    capturedAt: "2026-04-20T12:00:00.000Z",
    capturedLatLng: null,
    ocrValue: 12048,
    finalValue: 12048,
    ocrConfidence: 0.93,
    status: "AWAITING_CONFIRMATION",
    verifiedBy: null,
    verificationNote: null,
  },
  {
    id: "reading-3",
    sessionId: "session-1",
    type: "END",
    photoUrl: "/uploads/review.jpg",
    originalFileName: "review.jpg",
    capturedAt: "2026-04-20T11:00:00.000Z",
    capturedLatLng: null,
    ocrValue: null,
    finalValue: null,
    ocrConfidence: 0.24,
    status: "MANUAL_REVIEW_REQUIRED",
    verifiedBy: null,
    verificationNote: "Agent marked OCR as incorrect.",
  },
  {
    id: "reading-4",
    sessionId: "session-1",
    type: "START",
    photoUrl: "/uploads/pending.jpg",
    originalFileName: "pending.jpg",
    capturedAt: "2026-04-20T13:00:00.000Z",
    capturedLatLng: null,
    ocrValue: null,
    finalValue: null,
    ocrConfidence: null,
    status: "OCR_PENDING",
    verifiedBy: null,
    verificationNote: null,
  },
];

describe("groupAgentReadings", () => {
  it("shows only active statuses in the needs-action bucket", () => {
    const grouped = groupAgentReadings(readings);

    expect(grouped.needsAction.map((reading) => reading.id)).toEqual(["reading-4", "reading-2"]);
  });

  it("keeps confirmed and manager-review items in history", () => {
    const grouped = groupAgentReadings(readings);

    expect(grouped.history.map((reading) => reading.id)).toEqual(["reading-3", "reading-1"]);
  });
});
