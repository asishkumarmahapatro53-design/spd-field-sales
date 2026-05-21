import type { OdometerReading, ReadingStatus } from "@/lib/types";

const NEEDS_ACTION_STATUSES = new Set<ReadingStatus>(["AWAITING_CONFIRMATION", "OCR_PENDING"]);
const HISTORY_STATUSES = new Set<ReadingStatus>(["CONFIRMED", "MANUAL_REVIEW_REQUIRED", "MANUAL_VERIFIED", "DISCARDED"]);

function sortReadingsNewestFirst(readings: OdometerReading[]) {
  return [...readings].sort((left, right) => {
    return new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime();
  });
}

export function groupAgentReadings(
  readings: OdometerReading[],
): {
  needsAction: OdometerReading[];
  history: OdometerReading[];
} {
  const sortedReadings = sortReadingsNewestFirst(readings);

  return {
    needsAction: sortedReadings.filter((reading) => NEEDS_ACTION_STATUSES.has(reading.status)),
    history: sortedReadings.filter((reading) => HISTORY_STATUSES.has(reading.status)),
  };
}
