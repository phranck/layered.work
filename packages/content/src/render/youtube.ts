/** The sole frame origin allowed for authored YouTube embeds. */
export const YOUTUBE_FRAME_ORIGIN = "https://www.youtube-nocookie.com";

const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);

/** Accept only provider embed URLs and discard all supplied query parameters. */
export function youtubeEmbedUrl(value: string): string | undefined {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject characters the URL parser could normalize away.
  if (value.trim() !== value || /[\u0000-\u0020\u007f\\]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    const video = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(url.pathname)?.[1];
    if (
      url.protocol !== "https:" ||
      !ALLOWED_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !video
    ) {
      return undefined;
    }
    return `${YOUTUBE_FRAME_ORIGIN}/embed/${video}`;
  } catch {
    return undefined;
  }
}
