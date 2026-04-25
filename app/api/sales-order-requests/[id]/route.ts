import { decideSalesOrderSchedule } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { status?: "SCHEDULE_APPROVED" | "SCHEDULE_REJECTED"; note?: string };
    const { id } = await context.params;
    const orderRequest = await decideSalesOrderSchedule(
      user,
      id,
      body.status === "SCHEDULE_REJECTED" ? "SCHEDULE_REJECTED" : "SCHEDULE_APPROVED",
      `${body.note ?? ""}`,
    );
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
