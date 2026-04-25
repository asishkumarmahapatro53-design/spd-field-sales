import { logoutCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST() {
  try {
    await logoutCurrentUser();
    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
