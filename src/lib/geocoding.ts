export interface ReverseGeocodeResult {
  provider: string;
  address: string | null;
  error: string | null;
}

function trimEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function sanitizeGeocodingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted-token]").replace(/\s+/g, " ").slice(0, 360);
}

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function addQueryParam(url: URL, key: string, value: string) {
  if (key && value && !url.searchParams.has(key)) {
    url.searchParams.set(key, value);
  }
}

function readAddressFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const direct =
    record.display_name ??
    record.formatted_address ??
    record.formattedAddress ??
    record.formattedAddressString ??
    record.address ??
    record.addr ??
    record.place_name ??
    record.name;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const result = record.result;
  if (result && typeof result === "object") {
    const nested = readAddressFromPayload(result);
    if (nested) return nested;
  }

  for (const key of ["results", "features", "data"]) {
    const entries = record[key];
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const nested = readAddressFromPayload(entry);
        if (nested) return nested;
        if (entry && typeof entry === "object") {
          const properties = (entry as Record<string, unknown>).properties;
          const propertyAddress = readAddressFromPayload(properties);
          if (propertyAddress) return propertyAddress;
        }
      }
    }
  }

  return null;
}

export async function reverseGeocodeWithMaply(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  return reverseGeocodeWithMappls(lat, lng);
}

export async function reverseGeocodeWithMappls(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  if (!isValidCoordinate(lat, lng)) {
    return { provider: "mappls", address: null, error: "Invalid GPS coordinates." };
  }

  const apiKey = trimEnv("MAPPLS_REST_API_KEY");
  if (!apiKey) {
    return {
      provider: "mappls",
      address: null,
      error: "Mappls reverse geocoding is not configured. Add MAPPLS_REST_API_KEY in AWS.",
    };
  }

  const url = new URL(`https://apis.mappls.com/advancedmaps/v1/${encodeURIComponent(apiKey)}/rev_geocode`);
  addQueryParam(url, "lat", String(lat));
  addQueryParam(url, "lng", String(lng));

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(Number(trimEnv("MAPPLS_TIMEOUT_MS")) || 15000),
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;

    if (!response.ok) {
      return {
        provider: "mappls",
        address: null,
        error: `Mappls reverse geocoding returned HTTP ${response.status}.`,
      };
    }

    return {
      provider: "mappls",
      address: readAddressFromPayload(payload),
      error: null,
    };
  } catch (error) {
    return {
      provider: "mappls",
      address: null,
      error: sanitizeGeocodingError(error),
    };
  }
}

export async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  if (!isValidCoordinate(lat, lng)) {
    return { provider: "nominatim", address: null, error: "Invalid GPS coordinates." };
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "SPD Field Sales",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { provider: "nominatim", address: null, error: `Nominatim returned HTTP ${response.status}.` };
    }
    const payload = (await response.json()) as { display_name?: string };
    return { provider: "nominatim", address: payload.display_name ?? null, error: null };
  } catch (error) {
    return { provider: "nominatim", address: null, error: sanitizeGeocodingError(error) };
  }
}

export async function reverseGeocodeServer(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const provider = (trimEnv("GPS_GEOCODER") || "mappls").toLowerCase();

  if (provider === "mappls" || provider === "maply") {
    const mappls = await reverseGeocodeWithMappls(lat, lng);
    if (mappls.address || trimEnv("GPS_GEOCODER_DISABLE_FALLBACK").toLowerCase() === "true") {
      return mappls;
    }
  }

  return reverseGeocodeWithNominatim(lat, lng);
}
