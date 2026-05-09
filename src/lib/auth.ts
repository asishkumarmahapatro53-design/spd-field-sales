import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { deleteCollectionItem, readCollection, upsertCollectionItem } from "@/lib/db";
import { nowIso } from "@/lib/date";
import { verifyPassword } from "@/lib/password";
import type { User, UserRole } from "@/lib/types";

const COOKIE_NAME = "spd_auth_token";
const DEMO_ROLE_COOKIE_NAME = "spd_demo_role";
const DEMO_USER_COOKIE_NAME = "spd_demo_user";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SWITCHABLE_ROLES: UserRole[] = ["SALES_AGENT", "MANAGER", "ACCOUNTING", "BATCHER", "MIX_DESIGN", "PRODUCTION_MANAGER"];

export function isLoginDisabled() {
  return process.env.DISABLE_LOGIN === "true";
}

function normalizeRole(value: string | undefined): UserRole | null {
  if (!value) {
    return null;
  }

  return SWITCHABLE_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

export function getDashboardPathForRole(role: UserRole) {
  if (role === "SALES_AGENT") {
    return "/agent";
  }

  if (role === "MANAGER") {
    return "/manager";
  }

  if (role === "MIX_DESIGN") {
    return "/mix-design";
  }

  if (role === "PRODUCTION_MANAGER") {
    return "/production";
  }

  if (role === "BATCHER") {
    return "/batcher";
  }

  return "/accounting";
}

async function getDemoUser() {
  const cookieStore = await cookies();
  const selectedRole = normalizeRole(cookieStore.get(DEMO_ROLE_COOKIE_NAME)?.value) ?? "SALES_AGENT";
  const selectedUserId = cookieStore.get(DEMO_USER_COOKIE_NAME)?.value;
  const users = await readCollection("users");
  const selectedUser = users.find(
    (entry) => entry.id === selectedUserId && entry.role === selectedRole && entry.status === "ACTIVE",
  );

  if (selectedUser) {
    return selectedUser;
  }

  return (
    users.find((entry) => entry.role === selectedRole && entry.status === "ACTIVE") ??
    users.find((entry) => entry.status === "ACTIVE") ??
    null
  );
}

export async function setDemoRole(role: UserRole, userId?: string | null) {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_ROLE_COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (userId) {
    cookieStore.set(DEMO_USER_COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  } else {
    cookieStore.delete(DEMO_USER_COOKIE_NAME);
  }
}

export async function loginWithEmployeeId(employeeId: string, password: string) {
  const users = await readCollection("users", {
    filters: [{ field: "employeeId", op: "==", value: employeeId }],
    limit: 1,
  });
  const user = users.find((entry) => entry.employeeId === employeeId && entry.status === "ACTIVE");

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  const token = randomUUID();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await upsertCollectionItem("authSessions", {
    id: sessionId,
    userId: user.id,
    token,
    createdAt: nowIso(),
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });

  return user;
}

export async function logoutCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    const authSessions = await readCollection("authSessions", {
      filters: [{ field: "token", op: "==", value: token }],
      limit: 1,
    });
    const authSession = authSessions[0];

    if (authSession) {
      await deleteCollectionItem("authSessions", authSession.id);
    }
  }

  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(DEMO_ROLE_COOKIE_NAME);
  cookieStore.delete(DEMO_USER_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  if (isLoginDisabled()) {
    return getDemoUser();
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const authSessions = await readCollection("authSessions", {
    filters: [{ field: "token", op: "==", value: token }],
    limit: 1,
  });
  const authSession = authSessions.find(
    (entry) => entry.token === token && new Date(entry.expiresAt).getTime() > Date.now(),
  );

  if (!authSession) {
    return null;
  }

  const users = await readCollection("users", {
    filters: [{ field: "id", op: "==", value: authSession.userId }],
    limit: 1,
  });

  return users[0] ?? null;
}

export async function requireUser(role?: UserRole) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (role && user.role !== role) {
    redirect("/dashboard");
  }

  return user;
}
