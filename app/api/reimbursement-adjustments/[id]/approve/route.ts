import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { decideReimbursementAdjustment } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING", "MANAGER"]);
    const body = (await request.json().catch(() => ({}))) as { status?: "APPROVED" | "REJECTED"; remark?: string };
    const { id } = await context.params;
    const adjustment = await decideReimbursementAdjustment(
      user,
      id,
      body.status === "REJECTED" ? "REJECTED" : "APPROVED",
      `${body.remark ?? ""}`,
    );
    return jsonOk({ adjustment });
  } catch (error) {
    return jsonError(error);
  }
}
