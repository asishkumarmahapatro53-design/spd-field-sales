import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { decideInformalQuotationRequest } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { status?: "APPROVED" | "REJECTED"; decisionNote?: string };
    const { id } = await context.params;
    const quotation = await decideInformalQuotationRequest(
      user,
      id,
      body.status === "REJECTED" ? "REJECTED" : "APPROVED",
      `${body.decisionNote ?? ""}`,
    );

    return jsonOk({ quotation });
  } catch (error) {
    return jsonError(error);
  }
}
