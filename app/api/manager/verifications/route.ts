import { listVerificationQueue } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function GET() {
  try {
    await requireApiUser(["MANAGER"]);
    const verificationQueue = await listVerificationQueue();
    return jsonOk({ verificationQueue });
  } catch (error) {
    return jsonError(error);
  }
}
