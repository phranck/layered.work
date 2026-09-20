/** One API origin for the browser bundle and its nginx content policy. */
export function dashboardApiOrigin(command = "build") {
  const value =
    process.env.API_ORIGIN ?? (command === "serve" ? "http://localhost:4002" : "https://api.layered.work");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("API_ORIGIN must be a valid HTTP(S) origin.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("API_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment.");
  }
  return url.origin;
}
