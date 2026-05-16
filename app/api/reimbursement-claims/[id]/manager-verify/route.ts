import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { verifyReimbursementClaimByManager } from "@/lib/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const claim = await verifyReimbursementClaimByManager(user, id, `${body.note ?? ""}`);
    return jsonOk({ claim });
  } catch (error) {
    return jsonError(error);
  }
}
