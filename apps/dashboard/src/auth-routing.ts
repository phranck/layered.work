export function safeReturnTo(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/posts";
  try {
    const target = new URL(value, "https://dashboard.layered.work");
    if (target.origin !== "https://dashboard.layered.work" || target.pathname === "/login") return "/posts";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/posts";
  }
}

export function expirationLoginLocation(location: {
  pathname: string;
  search: string;
  hash: string;
}): string | null {
  if (location.pathname === "/login") return null;
  const returnTo = safeReturnTo(`${location.pathname}${location.search}${location.hash}`);
  return `/login?expired=1&returnTo=${encodeURIComponent(returnTo)}`;
}
