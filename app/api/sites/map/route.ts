import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { getSiteMapMarkersForUser } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER", "PRODUCTION_MANAGER"]);
    const url = new URL(request.url);
    const includeClosed = url.searchParams.get("includeClosed") === "1";
    const markers = await getSiteMapMarkersForUser(user);
    const visibleMarkers = includeClosed
      ? markers
      : markers.filter((marker) => marker.siteStatus !== "DEAD" && marker.siteStatus !== "LOST");

    return jsonOk({ markers: visibleMarkers });
  } catch (error) {
    return jsonError(error);
  }
}
