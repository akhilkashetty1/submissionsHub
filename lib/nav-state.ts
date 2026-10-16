"use client";

import { useSyncExternalStore } from "react";

/**
 * "A navigation is in flight" — one flag shared by the top progress bar, the
 * dimmed results table and anything else that should react the moment you click.
 *
 * Started by link clicks (NavProgress) and programmatic navigations (search, delete);
 * ended when the URL changes, or after a safety timeout so the bar can never stick.
 */
let pending = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(pending: boolean) => void>();

const emit = () => listeners.forEach((l) => l(pending));

export function startNav() {
  if (pending) return;
  pending = true;
  emit();
  timer = setTimeout(endNav, 20_000);
}

export function endNav() {
  clearTimeout(timer);
  if (!pending) return;
  pending = false;
  emit();
}

export function subscribeNav(listener: (pending: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNavPending() {
  return useSyncExternalStore(
    (cb) => subscribeNav(cb),
    () => pending,
    () => false,
  );
}
