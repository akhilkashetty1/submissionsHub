/**
 * Name of the cookie that remembers a collapsed menu until the browser is closed (the menu always
 * starts open on a fresh visit). Renamed from the old year-long "hub_sidebar" so those stop applying. It lives in a plain module (not in the client
 * component) so the server can read the very same string: a server component importing a value from a
 * "use client" file gets a placeholder, not the value.
 */
export const SIDEBAR_COOKIE = "hub_sidebar_session";

/** Remembers that the table is in focus (full-screen) mode until the browser is closed, so the server renders it straight away. */
export const FOCUS_COOKIE = "hub_focus_session";
