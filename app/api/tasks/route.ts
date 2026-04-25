import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createTask } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["MANAGER", "ACCOUNTING"]);
    const body = (await request.json()) as Record<string, string>;
    const task = await createTask(user, {
      subject: `${body.subject ?? ""}`,
      explanation: `${body.explanation ?? ""}`,
      deadline: new Date(`${body.deadline ?? ""}`).toISOString(),
      assignedTo: `${body.assignedTo ?? ""}`,
    });
    return jsonOk({ task }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
