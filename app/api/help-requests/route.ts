import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createHelpRequest } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json()) as Record<string, string>;
    const helpRequest = await createHelpRequest(user, {
      sessionDate: `${body.sessionDate ?? ""}`,
      requestedField: `${body.requestedField ?? ""}`,
      explanation: `${body.explanation ?? ""}`,
    });
    return jsonOk({ helpRequest }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
