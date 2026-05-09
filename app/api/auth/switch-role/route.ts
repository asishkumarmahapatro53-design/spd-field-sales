import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { getDashboardPathForRole, isLoginDisabled, setDemoRole, SWITCHABLE_ROLES } from "@/lib/auth";
import { readCollection } from "@/lib/db";
import type { UserRole } from "@/lib/types";

export async function POST(request: Request) {
  try {
    if (!isLoginDisabled()) {
      throw new ApiError(403, "Dashboard switch is only available when login is disabled.");
    }

    const body = (await request.json().catch(() => ({}))) as { role?: string; userId?: string };
    const role = `${body.role ?? ""}` as UserRole;
    const userId = `${body.userId ?? ""}`.trim();

    if (!SWITCHABLE_ROLES.includes(role)) {
      throw new ApiError(400, "Invalid dashboard role.");
    }

    if (userId) {
      const users = await readCollection("users", {
        filters: [{ field: "id", op: "==", value: userId }],
        limit: 1,
      });
      const user = users.find((entry) => entry.role === role && entry.status === "ACTIVE");

      if (!user) {
        throw new ApiError(400, "Selected dashboard user is not available.");
      }
    }

    await setDemoRole(role, userId || null);

    return jsonOk({
      success: true,
      path: getDashboardPathForRole(role),
    });
  } catch (error) {
    return jsonError(error);
  }
}
