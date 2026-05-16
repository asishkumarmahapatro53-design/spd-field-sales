import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { approveCreditOverrideByManager } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const { id } = await context.params;
    const body = (await request.json()) as {
      amountLimit?: number;
      expiresAt?: string;
      reason?: string;
    };
    const orderRequest = await approveCreditOverrideByManager(user, id, {
      amountLimit: Number(body.amountLimit),
      expiresAt: `${body.expiresAt ?? ""}`,
      reason: `${body.reason ?? ""}`,
    });
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
