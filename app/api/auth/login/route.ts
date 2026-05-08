import { loginWithEmployeeId } from "@/lib/auth";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { assertRateLimit, buildRateLimitKey, clearRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { employeeId?: string; password?: string };
    const employeeId = `${body.employeeId ?? ""}`.trim();
    const rateLimitKey = buildRateLimitKey(request, "login", employeeId || "missing-employee");

    assertRateLimit(rateLimitKey, {
      limit: 8,
      windowMs: 15 * 60 * 1000,
      message: "Too many login attempts.",
    });

    const user = await loginWithEmployeeId(employeeId, `${body.password ?? ""}`);

    if (!user) {
      throw new ApiError(401, "Invalid employee ID or password.");
    }

    clearRateLimit(rateLimitKey);

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
