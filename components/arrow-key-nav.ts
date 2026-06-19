"use client";

import type { KeyboardEvent } from "react";

const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

export function moveFocusWithArrowKeys(
  event: KeyboardEvent<HTMLElement>,
  itemSelector = "[data-arrow-nav-item]"
) {
  if (!NAV_KEYS.has(event.key)) return;

  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
    return;
  }

  const current = target.closest<HTMLElement>(itemSelector);
  if (!current) return;

  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(itemSelector)).filter(
    (item) => !item.hasAttribute("disabled") && item.tabIndex !== -1 && item.offsetParent !== null
  );
  if (items.length === 0) return;

  const index = items.indexOf(current);
  if (index === -1) return;

  event.preventDefault();

  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;

  items[nextIndex]?.focus();
}
