import { endWorkdaySession } from "@/lib/repository";
import { jsonError, jsonOk, parseLatLng, requireApiUser } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json().catch(() => ({}))) as { lat?: string; lng?: string };

    if (user.role !== "SALES_AGENT") {
      return jsonOk({ ended: false, message: "No workday session needed for this role." });
    }

    const session = await endWorkdaySession(user, parseLatLng(body));
    return jsonOk({ ended: true, session });
  } catch (error) {
    return jsonError(error);
  }
}
