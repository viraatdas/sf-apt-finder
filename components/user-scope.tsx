"use client";

import { useEffect } from "react";
import { USER_COOKIE_NAME, USER_STORAGE_KEY } from "@/lib/user";

export function getOrCreateUserId(): string {
  const existing = window.localStorage.getItem(USER_STORAGE_KEY);
  if (existing) {
    syncUserCookie(existing);
    return existing;
  }
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(USER_STORAGE_KEY, id);
  syncUserCookie(id);
  return id;
}

function syncUserCookie(userId: string) {
  document.cookie = `${USER_COOKIE_NAME}=${encodeURIComponent(userId)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

export function UserScope() {
  useEffect(() => {
    getOrCreateUserId();
  }, []);
  return null;
}
