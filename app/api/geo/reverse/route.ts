import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { reverseGeocodeServer } from "@/lib/geocoding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(400, "Valid latitude and longitude are required.");
    }

    const result = await reverseGeocodeServer(lat, lng);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
