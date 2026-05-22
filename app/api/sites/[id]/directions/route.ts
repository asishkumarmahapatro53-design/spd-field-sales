import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { recordSiteDirectionUse } from "@/lib/repository";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const { id } = await context.params;
    const site = await recordSiteDirectionUse(user, id);

    return jsonOk({
      site,
      locationCorrectionRequired: !site.latLng,
      locationCorrectionReason: !site.latLng
        ? "Site coordinates are missing. Mappls may use address fallback if supported, but site location should be corrected."
        : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
