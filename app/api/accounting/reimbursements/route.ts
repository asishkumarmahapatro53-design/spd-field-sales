import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { getAccountingDashboardData } from "@/lib/repository";

export async function GET() {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const data = await getAccountingDashboardData(user);
    return jsonOk({ reimbursements: data.reimbursements });
  } catch (error) {
    return jsonError(error);
  }
}
