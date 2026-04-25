import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { listLeads } from "@/lib/repository";

export async function GET() {
  try {
    const user = await requireApiUser();
    const leads = await listLeads(user);
    return jsonOk({ leads });
  } catch (error) {
    return jsonError(error);
  }
}
