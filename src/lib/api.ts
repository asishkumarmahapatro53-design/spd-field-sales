import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { LatLng, User, UserRole } from "@/lib/types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Something went wrong." },
    { status: 500 },
  );
}

export async function requireApiUser(roles?: UserRole[]) {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiError(401, "Please sign in first.");
  }

  if (roles && !roles.includes(user.role)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }

  return user;
}

export function parseLatLng(input: { lat?: unknown; lng?: unknown }) {
  const lat = Number(input.lat);
  const lng = Number(input.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng } satisfies LatLng;
}

export function requireString(value: FormDataEntryValue | string | null | undefined, message: string) {
  const normalized = `${value ?? ""}`.trim();

  if (!normalized) {
    throw new ApiError(400, message);
  }

  return normalized;
}

export function requireNumber(value: FormDataEntryValue | string | null | undefined, message: string) {
  const normalized = Number(`${value ?? ""}`);

  if (!Number.isFinite(normalized)) {
    throw new ApiError(400, message);
  }

  return normalized;
}

export function toIsoDateTime(value: string, message: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, message);
  }
  return date.toISOString();
}
