import { extractPanFromGstin, isValidGstin, normalizeGstin } from "@/lib/legal-workflow";

type JsonRecord = Record<string, unknown>;

export interface GstVerifyConfig {
  apiKey: string;
  apiUrl: string;
  timeoutMs: number;
}

export interface GstVerificationResult {
  gstin: string;
  pan: string | null;
  legalName: string | null;
  tradeName: string | null;
  taxpayerType: string | null;
  registrationStatus: string | null;
  billingAddress: string | null;
  provider: "gstverify";
  verifiedAt: string;
}

export class GstVerifyConfigError extends Error {}

export class GstVerifyRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_GSTVERIFY_API_URL = "https://gstverify.co.in/api/v1/verify";

const STRING_KEYS = {
  gstin: ["gstin", "gstIn", "gst_number", "gstNumber", "gst"],
  legalName: ["legalName", "legal_name", "legalBusinessName", "legal_business_name", "lgnm", "legalnam"],
  tradeName: ["tradeName", "trade_name", "tradeNam", "trade_name_of_business", "tradeNam"],
  pan: ["pan", "panNumber", "pan_number"],
  taxpayerType: ["taxpayerType", "taxpayer_type", "dty", "taxpayer"],
  registrationStatus: ["status", "registrationStatus", "registration_status", "sts", "gstStatus"],
};

const ADDRESS_KEYS = [
  "billingAddress",
  "billing_address",
  "address",
  "addr",
  "principalAddress",
  "principal_address",
  "principalPlaceOfBusiness",
  "principal_place_of_business",
  "pradr",
];

const ADDRESS_PART_KEYS = [
  "buildingNumber",
  "bno",
  "buildingName",
  "bnm",
  "floorNumber",
  "flno",
  "street",
  "st",
  "location",
  "loc",
  "city",
  "dst",
  "district",
  "state",
  "stcd",
  "pincode",
  "pinCode",
  "pncd",
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = `${value}`.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function getCandidateRecords(value: unknown, maxDepth = 4) {
  const records: JsonRecord[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];

  while (queue.length) {
    const item = queue.shift();
    if (!item || item.depth > maxDepth || !isRecord(item.value)) {
      continue;
    }

    records.push(item.value);

    for (const child of Object.values(item.value)) {
      if (isRecord(child)) {
        queue.push({ value: child, depth: item.depth + 1 });
      }
    }
  }

  return records;
}

function pickString(records: JsonRecord[], keys: string[]) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (normalizedKeys.has(key.toLowerCase())) {
        const normalized = cleanString(value);
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return null;
}

function formatAddressValue(value: unknown): string | null {
  const direct = cleanString(value);
  if (direct) {
    return direct;
  }

  if (!isRecord(value)) {
    return null;
  }

  const nestedAddress = value.addr ?? value.address;
  const nested = nestedAddress && nestedAddress !== value ? formatAddressValue(nestedAddress) : null;
  if (nested) {
    return nested;
  }

  const parts = ADDRESS_PART_KEYS.map((key) => cleanString(value[key])).filter((part): part is string => Boolean(part));
  const uniqueParts = [...new Set(parts)];

  return uniqueParts.length ? uniqueParts.join(", ") : null;
}

function pickAddress(records: JsonRecord[]) {
  const normalizedKeys = new Set(ADDRESS_KEYS.map((key) => key.toLowerCase()));

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (normalizedKeys.has(key.toLowerCase())) {
        const address = formatAddressValue(value);
        if (address) {
          return address;
        }
      }
    }
  }

  return null;
}

function safeJsonSnippet(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return "unreadable response";
  }
}

export function getGstVerifyConfig(): GstVerifyConfig {
  const apiKey = `${process.env.GSTVERIFY_API_KEY ?? ""}`.trim();
  const apiUrl = `${process.env.GSTVERIFY_API_URL ?? DEFAULT_GSTVERIFY_API_URL}`.trim();
  const timeoutMs = Number(process.env.GSTVERIFY_TIMEOUT_MS ?? "15000");

  if (!apiKey) {
    throw new GstVerifyConfigError("GSTVerify API key is not configured.");
  }

  if (!apiUrl) {
    throw new GstVerifyConfigError("GSTVerify API URL is not configured.");
  }

  return {
    apiKey,
    apiUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
  };
}

export function normalizeGstVerifyResponse(raw: unknown, fallbackGstin: string): GstVerificationResult {
  const records = getCandidateRecords(raw);
  const gstin = normalizeGstin(pickString(records, STRING_KEYS.gstin) ?? fallbackGstin);
  const pan = pickString(records, STRING_KEYS.pan) ?? extractPanFromGstin(gstin);

  return {
    gstin,
    pan,
    legalName: pickString(records, STRING_KEYS.legalName),
    tradeName: pickString(records, STRING_KEYS.tradeName),
    taxpayerType: pickString(records, STRING_KEYS.taxpayerType),
    registrationStatus: pickString(records, STRING_KEYS.registrationStatus),
    billingAddress: pickAddress(records),
    provider: "gstverify",
    verifiedAt: new Date().toISOString(),
  };
}

export async function verifyGstinWithGstVerify(value: string, config = getGstVerifyConfig()) {
  const gstin = normalizeGstin(value);

  if (!isValidGstin(gstin)) {
    throw new GstVerifyRequestError(400, "Enter a valid 15-character GSTIN.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}/${encodeURIComponent(gstin)}`, {
      headers: {
        Accept: "application/json",
        "X-API-Key": config.apiKey,
      },
      signal: controller.signal,
    });

    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      throw new GstVerifyRequestError(
        response.status,
        `GSTVerify rejected the GSTIN lookup: ${safeJsonSnippet(raw)}`,
      );
    }

    const result = normalizeGstVerifyResponse(raw, gstin);

    if (!result.legalName || !result.billingAddress) {
      throw new GstVerifyRequestError(
        502,
        "GSTVerify responded but did not return both legal name and billing address.",
      );
    }

    return result;
  } catch (error) {
    if (error instanceof GstVerifyRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new GstVerifyRequestError(504, "GSTVerify lookup timed out.");
    }

    throw new GstVerifyRequestError(502, error instanceof Error ? error.message : "GSTVerify lookup failed.");
  } finally {
    clearTimeout(timeout);
  }
}
