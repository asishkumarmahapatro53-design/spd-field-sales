import { decideApprovalRequest } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { status?: "APPROVED" | "REJECTED"; decisionNote?: string };
    const { id } = await context.params;
    const approval = await decideApprovalRequest(
      user,
      id,
      body.status === "REJECTED" ? "REJECTED" : "APPROVED",
      `${body.decisionNote ?? ""}`,
    );
    return jsonOk({ approval });
  } catch (error) {
    return jsonError(error);
  }
}
