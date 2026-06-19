import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { USER_COOKIE_NAME } from "@/lib/user";

const MAX_USER_ID_LENGTH = 128;

export function normalizeUserId(value: string | null | undefined): string | null {
  const userId = value?.trim();
  if (!userId || userId.length > MAX_USER_ID_LENGTH) return null;
  return userId;
}

export async function currentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return normalizeUserId(cookieStore.get(USER_COOKIE_NAME)?.value);
}

export function userIdFromRequest(req: NextRequest, explicit?: string | null): string | null {
  return normalizeUserId(explicit) ?? normalizeUserId(req.cookies.get(USER_COOKIE_NAME)?.value);
}
