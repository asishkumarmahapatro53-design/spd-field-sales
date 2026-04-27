import { NextResponse } from "next/server";
import { runSystemHealthChecks } from "@/lib/system-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  const validateGemini = url.searchParams.get("gemini") === "1";
  const configuredToken = process.env.SYSTEM_HEALTH_TOKEN?.trim();

  if (deep) {
    if (!configuredToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "SYSTEM_HEALTH_TOKEN is not configured, so deep production checks are blocked.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const receivedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (receivedToken !== configuredToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid system health token.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const report = await runSystemHealthChecks({
    deep,
    validateGemini,
    requireAppData: true,
  });

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
