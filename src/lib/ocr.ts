import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LatLng } from "@/lib/types";

export type OcrReadingKind = "ODO" | "TOTAL" | "TRIP" | "UNKNOWN";
export type OcrMeterStyle = "DIGITAL" | "ANALOG" | "UNKNOWN";

export interface OcrExtractionResult {
  value: number | null;
  capturedAt: string | null;
  kind: OcrReadingKind;
  confidence: number;
  note: string;
}

export interface SiteVisitPhotoMetadata {
  siteAddress: string | null;
  latLng: LatLng | null;
  capturedAt: string | null;
  confidence: number;
  note: string;
}

export interface VoiceNoteTranscriptResult {
  text: string | null;
  confidence: number;
  note: string;
}

interface OcrInput {
  fileName: string;
  localAbsolutePath: string | null;
  photoUrl?: string | null;
  inlineBytesBase64?: string | null;
  mimeType: string | null;
}

interface StructuredOcrPayload {
  reading_kind?: "ODO" | "TOTAL" | "TRIP" | "UNKNOWN" | "ODOMETER";
  reading_value?: number | string | null;
  meter_style?: "DIGITAL" | "ANALOG" | "UNKNOWN";
  whole_km_value?: number | string | null;
  decimal_tenths?: number | string | null;
  captured_at_ist?: string | null;
  confidence?: number | null;
  note?: string | null;
}

interface StructuredSiteVisitPayload {
  site_address?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  captured_at_ist?: string | null;
  confidence?: number | null;
  note?: string | null;
}

interface StructuredTranscriptionPayload {
  transcript_english?: string | null;
  confidence?: number | null;
  note?: string | null;
}

export function getOcrPromptText() {
  return [
    "Read the vehicle dashboard image and extract the meter reading.",
    "Return JSON only.",
    'Use this schema: {"reading_kind":"ODO|TOTAL|TRIP|UNKNOWN","meter_style":"DIGITAL|ANALOG|UNKNOWN","reading_value":number|null,"whole_km_value":number|null,"decimal_tenths":0_to_9|null,"captured_at_ist":"YYYY-MM-DDTHH:mm:ss+05:30"|null,"confidence":0_to_1,"note":"short note"}',
    "Rules:",
    "- Treat ODO, TOTAL, and TRIP as valid readings.",
    "- Prefer the number next to ODO, Odometer, TOTAL, or TRIP.",
    "- Do not use top range values like 27 km, 63 km, or 97 km as odometer readings.",
    "- Ignore speed values like 0 km/h, GPS coordinates, place names, map labels, and watermark location text.",
    "- For analog dashboards, read the central rolling odometer digits and ignore the speed scale.",
    "- For analog/mechanical rolling odometers, if the rightmost wheel is a different color, smaller window, offset wheel, or tenths/sub-meter wheel, treat it as a decimal digit, not a full kilometer digit.",
    "- For analog ODO readings, set meter_style to ANALOG and return whole_km_value as the main black digits. If a clear tenths wheel is visible, set decimal_tenths to that digit and set reading_value to whole_km_value plus the decimal tenths.",
    "- When an analog decimal wheel is clearly visible, return reading_value as a decimal number such as 25697.4, not 256974.",
    "- For digital ODO readings, set meter_style to DIGITAL and keep whole_km_value equal to the integer odometer reading. Do not invent a decimal for digital ODO readings.",
    "- Digital TRIP or TOTAL screens may legitimately show decimals. Keep those decimals when clearly visible.",
    "- If the analog decimal wheel is unclear, prefer the whole-kilometer reading and lower confidence rather than guessing.",
    "- Extract the timestamp from the GPS Map Camera watermark or visible dashboard date/time when present.",
    "- If a GPS watermark shows a date like 06/04/2026 in India, interpret it as DD/MM/YYYY.",
    "- Use reading_kind UNKNOWN and reading_value null only when no ODO, TOTAL, or TRIP value can be read.",
    "Examples:",
    '- Visible text "Odo 0035114 km" means {"reading_kind":"ODO","meter_style":"DIGITAL","whole_km_value":35114,"decimal_tenths":null,"reading_value":35114,"confidence":0.82}.',
    '- Visible text "Odo 3437 km" means {"reading_kind":"ODO","meter_style":"DIGITAL","whole_km_value":3437,"decimal_tenths":null,"reading_value":3437,"confidence":0.86}.',
    '- Analog rolling odometer showing "26594" with a separate rightmost white tenths wheel "4" means {"reading_kind":"ODO","meter_style":"ANALOG","whole_km_value":26594,"decimal_tenths":4,"reading_value":26594.4,"confidence":0.8}.',
    '- Analog rolling odometer showing "26362" with a separate decimal wheel "7" means {"reading_kind":"ODO","meter_style":"ANALOG","whole_km_value":26362,"decimal_tenths":7,"reading_value":26362.7,"confidence":0.78}.',
    '- If only range "97 km" is visible and no ODO/TOTAL/TRIP line is present, return {"reading_kind":"UNKNOWN","meter_style":"UNKNOWN","whole_km_value":null,"decimal_tenths":null,"reading_value":null,"confidence":0.25}.',
  ].join("\n");
}

function getSiteVisitPhotoPromptText() {
  return [
    "Read only the GPS Map Camera watermark or location overlay in this site visit image.",
    "Return JSON only.",
    'Use this schema: {"site_address":"string|null","lat":number|null,"lng":number|null,"captured_at_ist":"YYYY-MM-DDTHH:mm:ss+05:30"|null,"confidence":0_to_1,"note":"short note"}',
    "Rules:",
    "- Extract the location address shown in the watermark as site_address.",
    "- Prefer the full address line when visible. If only city/state is visible, return that shorter address.",
    "- Extract latitude and longitude from watermark text when visible.",
    "- Extract the timestamp from the GPS watermark when visible.",
    "- Ignore dashboard numbers, speed, odometer values, and any non-watermark text.",
    "- If a date uses slashes in India, interpret it as DD/MM/YYYY.",
    "- Return null for missing fields instead of guessing.",
  ].join("\n");
}

function getVoiceNotePromptText() {
  return [
    "Transcribe this voice note into clear English text.",
    "Return JSON only.",
    'Use this schema: {"transcript_english":"string|null","confidence":0_to_1,"note":"short note"}',
    "Rules:",
    "- The speaker may use any Indian language or mixed Hindi/English/Odia/Bengali terms.",
    "- Translate the meaning into concise professional English.",
    "- Preserve concrete grades, quantities, dates, and site details when spoken.",
    "- Do not add information that is not spoken.",
    "- Return transcript_english as null only if speech is not intelligible.",
  ].join("\n");
}

function normalizeReadingKind(value: string | null | undefined): OcrReadingKind {
  const normalized = value?.trim().toUpperCase();

  if (normalized === "ODO" || normalized === "ODOMETER") {
    return "ODO";
  }

  if (normalized === "TOTAL" || normalized === "TRIP") {
    return normalized;
  }

  return "UNKNOWN";
}

function normalizeMeterStyle(value: string | null | undefined): OcrMeterStyle {
  const normalized = value?.trim().toUpperCase();

  if (normalized === "DIGITAL" || normalized === "ANALOG") {
    return normalized;
  }

  return "UNKNOWN";
}

function parseCandidateNumber(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTenthsDigit(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9) {
    return value;
  }

  if (typeof value === "string" && /^\d$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}

export function normalizeGeminiReadingValue(input: {
  kind: OcrReadingKind;
  meterStyle: OcrMeterStyle;
  readingValue: number | null;
  wholeKmValue: number | null;
  decimalTenths: number | null;
}) {
  const { kind, meterStyle, readingValue, wholeKmValue, decimalTenths } = input;

  if (kind === "ODO") {
    if (meterStyle === "ANALOG" && wholeKmValue !== null) {
      return {
        value: decimalTenths !== null ? wholeKmValue + decimalTenths / 10 : wholeKmValue,
        noteSuffix:
          decimalTenths !== null
            ? ` Analog decimal wheel applied using tenths digit ${decimalTenths}.`
            : " Analog odometer normalized to whole-kilometer reading.",
      };
    }

    if (meterStyle === "DIGITAL") {
      if (wholeKmValue !== null) {
        return {
          value: wholeKmValue,
          noteSuffix:
            readingValue !== null && readingValue !== wholeKmValue
              ? " Digital ODO normalized to whole-kilometer reading."
              : "",
        };
      }

      if (readingValue !== null && !Number.isInteger(readingValue)) {
        return {
          value: Math.trunc(readingValue),
          noteSuffix: " Digital ODO decimal removed.",
        };
      }
    }
  }

  if ((kind === "TRIP" || kind === "TOTAL") && meterStyle === "ANALOG" && wholeKmValue !== null && decimalTenths !== null) {
    return {
      value: wholeKmValue + decimalTenths / 10,
      noteSuffix: ` Analog ${kind} decimal wheel applied using tenths digit ${decimalTenths}.`,
    };
  }

  return {
    value: readingValue,
    noteSuffix: "",
  };
}

function extractMeterReadingFromText(text: string): { kind: OcrReadingKind; value: number } | null {
  const patterns: Array<{ kind: OcrReadingKind; regex: RegExp }> = [
    { kind: "ODO", regex: /\b(?:odo|odometer)\b[^\d]{0,24}(\d[\d,\s]{0,10}(?:\.\d+)?)/i },
    { kind: "TOTAL", regex: /\btotal\b[^\d]{0,24}(\d[\d,\s]{0,10}(?:\.\d+)?)/i },
    { kind: "TRIP", regex: /\btrip\b[^\d]{0,24}(\d[\d,\s]{0,8}(?:\.\d+)?)/i },
  ];

  for (const { kind, regex } of patterns) {
    const match = text.match(regex);
    const value = match?.[1] ? parseCandidateNumber(match[1].replace(/\s+/g, "")) : null;

    if (value !== null) {
      return { kind, value };
    }
  }

  return null;
}

function toIsoFromIstParts(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  const date = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+05:30`,
  );

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseIsoDateTime(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseCameraDateTimeFromFilename(fileName: string) {
  const compactMatch = path.basename(fileName).match(/(20\d{2})(\d{2})(\d{2})[_-]?(\d{5,6})\s*(AM|PM)?/i);

  if (!compactMatch) {
    return null;
  }

  const [, yearValue, monthValue, dayValue, timeValue, meridiemValue] = compactMatch;
  const hourValue = timeValue.length === 5 ? timeValue.slice(0, 1) : timeValue.slice(0, 2);
  const minuteValue = timeValue.length === 5 ? timeValue.slice(1, 3) : timeValue.slice(2, 4);
  const secondValue = timeValue.length === 5 ? timeValue.slice(3, 5) : timeValue.slice(4, 6);
  let hour = Number(hourValue);
  const meridiem = meridiemValue?.toUpperCase();

  if (meridiem === "PM" && hour < 12) {
    hour += 12;
  }

  if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  return toIsoFromIstParts(Number(yearValue), Number(monthValue), Number(dayValue), hour, Number(minuteValue), Number(secondValue));
}

function parseGpsDateTimeFromText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const slashDateMatch = normalized.match(/(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2}).{0,40}?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);

  if (slashDateMatch) {
    const [, dayValue, monthValue, yearValue, hourValue, minuteValue, secondValue = "0", meridiemValue] = slashDateMatch;
    let hour = Number(hourValue);
    const meridiem = meridiemValue.toUpperCase();

    if (meridiem === "PM" && hour < 12) {
      hour += 12;
    }

    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }

    return toIsoFromIstParts(Number(yearValue), Number(monthValue), Number(dayValue), hour, Number(minuteValue), Number(secondValue));
  }

  const monthNameMatch = normalized.match(
    /(\d{1,2})\s+(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+(20\d{2}).{0,20}?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i,
  );

  if (!monthNameMatch) {
    return null;
  }

  const [, dayValue, monthName, yearValue, hourValue, minuteValue, secondValue = "0", meridiemValue] = monthNameMatch;
  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  let hour = Number(hourValue);
  const meridiem = meridiemValue.toUpperCase();

  if (meridiem === "PM" && hour < 12) {
    hour += 12;
  }

  if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  return toIsoFromIstParts(Number(yearValue), monthMap[monthName.toLowerCase()] ?? 0, Number(dayValue), hour, Number(minuteValue), Number(secondValue));
}

function parseCoordinateValue(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/[^\d.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseGpsCoordinatesFromText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const coordinateMatch = normalized.match(
    /Lat(?:itude)?\s*([+-]?\d+(?:\.\d+)?)\D{0,12}Lon(?:g|gitude)?\s*([+-]?\d+(?:\.\d+)?)/i,
  );

  if (!coordinateMatch) {
    return null;
  }

  const lat = Number(coordinateMatch[1]);
  const lng = Number(coordinateMatch[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng } satisfies LatLng;
}

function extractSiteAddressFromText(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const latLineIndex = lines.findIndex((line) => /Lat(?:itude)?\s*[+-]?\d/i.test(line));

  if (latLineIndex > 0) {
    for (let index = latLineIndex - 1; index >= 0; index -= 1) {
      const candidate = lines[index];
      if (/google|gps map camera|gmt|lat|long|km\/h|odo|trip|total/i.test(candidate)) {
        continue;
      }
      if (candidate.length >= 6) {
        return candidate;
      }
    }
  }

  const cityLine = lines.find((line) => /india/i.test(line) && !/google|gps map camera/i.test(line));
  return cityLine ?? null;
}

function fallbackFilenameOcr(fileName: string): OcrExtractionResult {
  const normalized = fileName.toLowerCase();
  const capturedAt = parseCameraDateTimeFromFilename(fileName);
  const normalizedWithoutCameraTimestamp = normalized.replace(/20\d{6}[_-]?\d{5,6}\s*(am|pm)?/i, " ");
  const meterReading = extractMeterReadingFromText(normalizedWithoutCameraTimestamp);

  if (meterReading) {
    return {
      value: meterReading.value,
      capturedAt,
      kind: meterReading.kind,
      confidence: 0.88,
      note: `Fallback OCR matched a ${meterReading.kind} reading from the uploaded file name.`,
    };
  }

  return {
    value: null,
    capturedAt,
    kind: "UNKNOWN",
    confidence: 0.34,
    note: "No ODO, TOTAL, or TRIP meter value was found. Manual review is required.",
  };
}

function guessMimeType(fileName: string, mimeType: string | null) {
  if (mimeType) {
    return mimeType;
  }

  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/jpeg";
  }
}

function summarizeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function buildStructuredResultFromText(text: string): OcrExtractionResult {
  const meterReading = extractMeterReadingFromText(text);
  const capturedAt = parseGpsDateTimeFromText(text);

  if (meterReading) {
    return {
      value: meterReading.value,
      capturedAt,
      kind: meterReading.kind,
      confidence: 0.8,
      note: `Gemini OCR detected a ${meterReading.kind} reading from image text${capturedAt ? " with watermark timestamp." : "."}`,
    };
  }

  return {
    value: null,
    capturedAt,
    kind: "UNKNOWN",
    confidence: 0.35,
    note: "Gemini OCR did not find a readable ODO, TOTAL, or TRIP value in extracted image text.",
  };
}

function buildSiteVisitMetadataFromText(text: string): SiteVisitPhotoMetadata {
  const siteAddress = extractSiteAddressFromText(text);
  const latLng = parseGpsCoordinatesFromText(text);
  const capturedAt = parseGpsDateTimeFromText(text);

  return {
    siteAddress,
    latLng,
    capturedAt,
    confidence: siteAddress || latLng ? 0.76 : 0.35,
    note: siteAddress || latLng ? "Gemini extracted site watermark details from image text." : "Gemini did not find a readable GPS watermark address or coordinates.",
  };
}

function buildVoiceNoteResultFromText(text: string): VoiceNoteTranscriptResult {
  const normalized = text.trim();
  return {
    text: normalized || null,
    confidence: normalized ? 0.65 : 0.3,
    note: normalized ? "Gemini returned transcript text." : "Gemini did not return a readable transcript.",
  };
}

function mergeCapturedAt(primary: OcrExtractionResult, fallback: OcrExtractionResult) {
  if (primary.capturedAt || !fallback.capturedAt) {
    return primary;
  }

  return {
    ...primary,
    capturedAt: fallback.capturedAt,
    note: `${primary.note} Timestamp recovered from GPS camera filename.`,
  };
}

export class OcrService {
  private isExternalOcrDisabled() {
    return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  }

  private getGeminiApiKey() {
    return process.env.GEMINI_API_KEY?.trim() || null;
  }

  private getGeminiModel() {
    return process.env.GEMINI_OCR_MODEL?.trim() || "gemini-2.5-flash-lite";
  }

  private async getInlineImageBase64(input: OcrInput) {
    const inlineBytesBase64 = input.inlineBytesBase64?.trim() || null;

    if (inlineBytesBase64) {
      return inlineBytesBase64;
    }

    if (input.localAbsolutePath) {
      const imageBytes = await readFile(input.localAbsolutePath);
      return imageBytes.toString("base64");
    }

    if (!input.photoUrl) {
      return null;
    }

    const response = await fetch(input.photoUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch uploaded image (${response.status}).`);
    }

    return Buffer.from(await response.arrayBuffer()).toString("base64");
  }

  private async runGeminiStructuredRequest(input: OcrInput, prompt: string) {
    if (this.isExternalOcrDisabled()) {
      return null;
    }

    const apiKey = this.getGeminiApiKey();

    if (!apiKey) {
      return null;
    }

    const inlineBase64 = await this.getInlineImageBase64(input);

    if (!inlineBase64) {
      return null;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.getGeminiModel()}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: guessMimeType(input.fileName, input.mimeType),
                    data: inlineBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini OCR ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  }

  private async runGeminiOcr(input: OcrInput): Promise<OcrExtractionResult | null> {
    const text = await this.runGeminiStructuredRequest(input, getOcrPromptText());

    if (!text) {
      return null;
    }

    let parsed: StructuredOcrPayload;

    try {
      parsed = JSON.parse(text) as StructuredOcrPayload;
    } catch {
      return buildStructuredResultFromText(text);
    }

    const rawValue = parsed.reading_value;
    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string" && rawValue.trim()
          ? parseCandidateNumber(rawValue.trim().replace(/\s+/g, ""))
          : null;
    const parsedValue = numericValue !== null && Number.isFinite(numericValue) ? numericValue : null;
    const kind = normalizeReadingKind(parsed.reading_kind);
    const meterStyle = normalizeMeterStyle(parsed.meter_style);
    const rawWholeKmValue = parsed.whole_km_value;
    const wholeKmValue =
      typeof rawWholeKmValue === "number"
        ? rawWholeKmValue
        : typeof rawWholeKmValue === "string" && rawWholeKmValue.trim()
          ? parseCandidateNumber(rawWholeKmValue.trim().replace(/\s+/g, ""))
          : null;
    const decimalTenths = parseTenthsDigit(parsed.decimal_tenths);
    const normalizedValue = normalizeGeminiReadingValue({
      kind,
      meterStyle,
      readingValue: parsedValue,
      wholeKmValue: wholeKmValue !== null && Number.isFinite(wholeKmValue) ? wholeKmValue : null,
      decimalTenths,
    });
    const value = normalizedValue.value;
    const capturedAt = parseIsoDateTime(parsed.captured_at_ist) ?? parseGpsDateTimeFromText(text);
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(parsed.confidence, 1))
        : value !== null && kind !== "UNKNOWN"
          ? 0.8
          : 0.35;

    return {
      value,
      capturedAt,
      kind,
      confidence,
      note:
        `${parsed.note?.trim() || ""}${normalizedValue.noteSuffix}`.trim() ||
        `Gemini OCR detected a ${kind} reading${value !== null ? ` of ${value}` : ""}${capturedAt ? " with watermark timestamp." : ""}.`,
    };
  }

  async extractSiteVisitMetadata(input: OcrInput): Promise<SiteVisitPhotoMetadata> {
    const capturedAtFromFileName = parseCameraDateTimeFromFilename(input.fileName);

    try {
      const text = await this.runGeminiStructuredRequest(input, getSiteVisitPhotoPromptText());

      if (!text) {
        return {
          siteAddress: null,
          latLng: null,
          capturedAt: capturedAtFromFileName,
          confidence: 0.3,
          note: "Gemini did not return site-visit watermark text.",
        };
      }

      try {
        const parsed = JSON.parse(text) as StructuredSiteVisitPayload;
        const siteAddress = `${parsed.site_address ?? ""}`.trim() || null;
        const lat = parseCoordinateValue(parsed.lat);
        const lng = parseCoordinateValue(parsed.lng);
        const latLng = lat !== null && lng !== null ? ({ lat, lng } satisfies LatLng) : null;
        const capturedAt = parseIsoDateTime(parsed.captured_at_ist) ?? parseGpsDateTimeFromText(text) ?? capturedAtFromFileName;
        const confidence =
          typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(parsed.confidence, 1))
            : siteAddress || latLng
              ? 0.78
              : 0.35;

        return {
          siteAddress,
          latLng,
          capturedAt,
          confidence,
          note: `${parsed.note?.trim() || ""}`.trim() || "Gemini extracted site-visit watermark metadata.",
        };
      } catch {
        const fallback = buildSiteVisitMetadataFromText(text);
        return {
          ...fallback,
          capturedAt: fallback.capturedAt ?? capturedAtFromFileName,
        };
      }
    } catch (error) {
      return {
        siteAddress: null,
        latLng: null,
        capturedAt: capturedAtFromFileName,
        confidence: 0.3,
        note: `Gemini site metadata extraction failed (${summarizeErrorMessage(error)}).`,
      };
    }
  }

  async transcribeVoiceNote(input: OcrInput): Promise<VoiceNoteTranscriptResult> {
    try {
      const text = await this.runGeminiStructuredRequest(input, getVoiceNotePromptText());

      if (!text) {
        return {
          text: null,
          confidence: 0.3,
          note: "Gemini did not return voice-note text.",
        };
      }

      try {
        const parsed = JSON.parse(text) as StructuredTranscriptionPayload;
        const transcript = `${parsed.transcript_english ?? ""}`.trim() || null;
        const confidence =
          typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(parsed.confidence, 1))
            : transcript
              ? 0.74
              : 0.35;

        return {
          text: transcript,
          confidence,
          note: `${parsed.note?.trim() || ""}`.trim() || "Gemini transcribed the voice note.",
        };
      } catch {
        return buildVoiceNoteResultFromText(text);
      }
    } catch (error) {
      return {
        text: null,
        confidence: 0.3,
        note: `Gemini voice-note transcription failed (${summarizeErrorMessage(error)}).`,
      };
    }
  }

  async extractOdometerValue(input: OcrInput): Promise<OcrExtractionResult> {
    const filenameFallback = fallbackFilenameOcr(input.fileName);

    try {
      const geminiResult = await this.runGeminiOcr(input);

      if (!geminiResult) {
        return filenameFallback;
      }

      return mergeCapturedAt(geminiResult, filenameFallback);
    } catch (error) {
      return {
        ...filenameFallback,
        note: `Gemini OCR failed (${summarizeErrorMessage(error)}). ${filenameFallback.note}`,
      };
    }
  }
}

export const ocrService = new OcrService();
