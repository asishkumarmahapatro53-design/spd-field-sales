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
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
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
