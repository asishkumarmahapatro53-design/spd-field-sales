"use client";

export async function getLocationPayload() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: "", lng: "" };
  }

  return new Promise<{ lat: string; lng: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }),
      () => resolve({ lat: "", lng: "" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export async function parseApiError(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return `Request failed (${response.status}).`;
  }

  const normalized = text.trim();

  if (normalized.startsWith("<!DOCTYPE") || normalized.startsWith("<html") || normalized.startsWith("<HTML")) {
    if (/request could not be satisfied/i.test(normalized)) {
      return `Upload failed before the app server could process the photo (${response.status}). Please retake the photo closer to the odometer and try again.`;
    }

    return `The server returned an HTML error page instead of an API response (${response.status}). Please try again.`;
  }

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error ?? `Request failed (${response.status}).`;
  } catch {
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
  }
}

export function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localTime.toISOString().slice(0, 16);
}
