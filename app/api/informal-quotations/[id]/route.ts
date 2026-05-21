import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { decideInformalQuotationRequest } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { status?: "APPROVED" | "REJECTED" | "CORRECTION_REQUESTED"; decisionNote?: string };
    const { id } = await context.params;
    const status =
      body.status === "REJECTED"
        ? "REJECTED"
        : body.status === "CORRECTION_REQUESTED"
          ? "CORRECTION_REQUESTED"
          : "APPROVED";
    const quotation = await decideInformalQuotationRequest(
      user,
      id,
      status,
      `${body.decisionNote ?? ""}`,
    );

    return jsonOk({ quotation });
  } catch (error) {
    return jsonError(error);
  }
}
