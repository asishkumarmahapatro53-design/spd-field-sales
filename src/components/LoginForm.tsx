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

export function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const employeeId = `${formData.get("employeeId") ?? ""}`.trim();
    const password = `${formData.get("password") ?? ""}`;

    const loginResponse = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });

    if (!loginResponse.ok) {
      const payload = await loginResponse.json().catch(() => ({ error: "Login failed." }));
      setError(payload.error ?? "Login failed.");
      setLoading(false);
      return;
    }

    const location = await getLocationPayload();
    const sessionResponse = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });

    if (!sessionResponse.ok) {
      const payload = await sessionResponse.json().catch(() => ({ error: "Workday session could not be started." }));
      setError(payload.error ?? "Workday session could not be started.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="employeeId">Employee ID</label>
        <input id="employeeId" name="employeeId" placeholder="SA1001" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="password123" required />
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="button-row">
        <button className="button" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in and start workday"}
        </button>
      </div>
    </form>
  );
}
