import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createTask } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["MANAGER", "ACCOUNTING"]);
    const body = (await request.json()) as Record<string, string>;

    const deadlineRaw = `${body.deadline ?? ""}`;
    const deadlineDate = new Date(deadlineRaw);
    if (!deadlineRaw || Number.isNaN(deadlineDate.getTime())) {
      throw new ApiError(400, "A valid deadline date is required.");
    }

    const task = await createTask(user, {
      subject: `${body.subject ?? ""}`,
      explanation: `${body.explanation ?? ""}`,
      deadline: deadlineDate.toISOString(),
      assignedTo: `${body.assignedTo ?? ""}`,
    });
    return jsonOk({ task }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
