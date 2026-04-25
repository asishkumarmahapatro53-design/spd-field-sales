import { loginWithEmployeeId } from "@/lib/auth";
import { ApiError, jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { employeeId?: string; password?: string };
    const user = await loginWithEmployeeId(`${body.employeeId ?? ""}`.trim(), `${body.password ?? ""}`);

    if (!user) {
      throw new ApiError(401, "Invalid employee ID or password.");
    }

    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
