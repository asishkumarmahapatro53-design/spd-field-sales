import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { checkOdooConnection, formatOdooError, getOdooEnvSummary } from "@/lib/odoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiUser(["MANAGER", "ACCOUNTING"]);
    const summary = getOdooEnvSummary();

    if (!summary.configured) {
      return jsonOk(
        {
          ok: false,
          configured: false,
          error: "Odoo env is incomplete.",
          summary,
        },
        503,
      );
    }

    try {
      const report = await checkOdooConnection();
      return jsonOk({
        ok: true,
        report,
      });
    } catch (error) {
      return jsonOk(
        {
          ok: false,
          configured: true,
          error: formatOdooError(error),
          summary,
        },
        502,
      );
    }
  } catch (error) {
    return jsonError(error);
  }
}
