import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { closeSite, reopenSite } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    const { id } = await context.params;
    const action = `${body.action ?? ""}`.trim();

    if (action === "close") {
      const site = await closeSite(user, id, {
        reason: `${body.reason ?? ""}`.trim(),
        remarks: `${body.remarks ?? ""}`.trim(),
      });
      return jsonOk({ site });
    }

    if (action === "reopen") {
      const site = await reopenSite(user, id, `${body.reason ?? ""}`);
      return jsonOk({ site });
    }

    throw new Error("Choose a valid site action.");
  } catch (error) {
    return jsonError(error);
  }
}
