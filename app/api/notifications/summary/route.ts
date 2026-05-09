import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { getNotificationSummary } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    const summary = await getNotificationSummary(user);
    return jsonOk(summary);
  } catch (error) {
    return jsonError(error);
  }
}
