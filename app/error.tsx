"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application runtime error:", error);
  }, [error]);

  return (
    <main className="page-shell login-shell">
      <section className="panel" style={{ maxWidth: 680, margin: "12vh auto" }}>
        <div className="panel-header">
          <div>
            <p className="metric-label">Production safety stop</p>
            <h1>The app could not load safely.</h1>
            <p className="panel-copy">
              A server-side check failed while loading the app. This usually means Firebase, S3, or another required
              production service is not available, so the app stopped instead of risking data loss.
            </p>
          </div>
        </div>
        {error.digest ? <p className="note-box">Error digest: {error.digest}</p> : null}
        <button className="button-primary" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
