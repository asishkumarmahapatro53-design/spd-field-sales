"use client";

import { useState } from "react";

async function getLocationPayload() {
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

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    const location = await getLocationPayload();
    await fetch("/api/sessions/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button type="button" className="button-ghost" onClick={handleLogout} disabled={busy}>
      {busy ? "Logging out..." : "Logout"}
    </button>
  );
}
