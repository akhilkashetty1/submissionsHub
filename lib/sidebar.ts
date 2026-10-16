/**
 * Name of the cookie that remembers a collapsed menu. It lives in a plain module (not in the client
 * component) so the server can read the very same string: a server component importing a value from a
 * "use client" file gets a placeholder, not the value.
 */
export const SIDEBAR_COOKIE = "hub_sidebar";
