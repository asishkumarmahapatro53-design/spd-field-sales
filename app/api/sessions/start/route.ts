import { jsonError, jsonOk, parseLatLng, requireApiUser } from "@/lib/api";
import { startWorkdaySession } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json().catch(() => ({}))) as { lat?: string; lng?: string };

    if (user.role !== "SALES_AGENT") {
      return jsonOk({ started: false, message: "No workday session needed for this role." });
    }

    const session = await startWorkdaySession(user, parseLatLng(body));
    return jsonOk({ started: true, session });
  } catch (error) {
    return jsonError(error);
  }
}
