import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createReimbursementClaim } from "@/lib/repository";

export async function POST() {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const claim = await createReimbursementClaim(user);
    return jsonOk({ claim }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
