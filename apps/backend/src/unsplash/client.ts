import { ErrorCode, unsplashPhotoId } from "@layered/schemas";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError } from "../http/response.js";
import { IMAGE_WIDTHS } from "../media/variants.js";

/**
 * Talking to the Unsplash API.
 *
 * Every request goes to `api.unsplash.com` with the access key, follows no
 * redirect and gives up after a few seconds. Only the fields Unsplash documents
 * are read, and each address in an answer is checked against the host it has to
 * name before anything stores or follows it, because whoever answers decides
 * those addresses.
 */

/** The one origin asked, so no address taken from an answer can carry the key elsewhere. */
const API_ORIGIN = "https://api.unsplash.com";

/** Where Unsplash serves its photos; every hotlinked address names this host. */
const IMAGE_HOST = "images.unsplash.com";

/** Where photographers' profiles are; the credit links one. */
const PROFILE_HOST = "unsplash.com";

/** How many results a page holds, the most Unsplash returns at once. */
const PER_PAGE = 30;

/** How long a request to Unsplash may take before the dashboard is told it failed. */
const TIMEOUT_MS = 10_000;

/** An `https` address on one host. A profile address is upgraded to `https`, since Unsplash has written both. */
const addressOn = (host: string) =>
  z
    .url()
    .transform((value) => new URL(value))
    .refine((url) => url.hostname === host && (url.protocol === "https:" || url.protocol === "http:"))
    .transform((url) => {
      url.protocol = "https:";
      return url.href;
    });

/** A photo, as much of it as the library keeps. */
const photo = z.object({
  id: unsplashPhotoId,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  description: z.string().nullish(),
  alt_description: z.string().nullish(),
  urls: z.object({ raw: addressOn(IMAGE_HOST), small: addressOn(IMAGE_HOST) }),
  links: z.object({ download_location: addressOn(new URL(API_ORIGIN).hostname) }),
  user: z.object({ name: z.string().min(1), links: z.object({ html: addressOn(PROFILE_HOST) }) }),
});

/** A photo as Unsplash describes it, after its addresses have been checked. */
export type UnsplashPhoto = z.infer<typeof photo>;

const searchAnswer = z.object({ total_pages: z.number().int().nonnegative(), results: z.array(photo) });

/** What the dashboard is told when no key is configured, which is a state rather than a failure. */
const NOT_CONFIGURED = "Unsplash is not configured: UNSPLASH_ACCESS_KEY is not set on the API.";

/**
 * Asks Unsplash and reads the answer through a schema.
 *
 * @param address - Where to ask, on `api.unsplash.com`.
 * @param answer - What the answer has to look like.
 * @throws `conflict` while no key is configured, and `internal` when Unsplash
 *   cannot be reached or answers with something else, with the reason kept for
 *   the log.
 */
async function ask<Schema extends z.ZodType>(address: URL, answer: Schema): Promise<z.infer<Schema>> {
  const key = config.UNSPLASH_ACCESS_KEY;
  if (!key) throw new HttpError(ErrorCode.Conflict, NOT_CONFIGURED);
  if (address.origin !== API_ORIGIN)
    throw new Error(`Refusing to send the Unsplash key to ${address.origin}.`);
  let response: Response;
  try {
    response = await fetch(address, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new HttpError(ErrorCode.Internal, "Unsplash could not be reached.", cause);
  }
  if (!response.ok)
    throw new HttpError(
      ErrorCode.Internal,
      "Unsplash refused the request.",
      new Error(`Unsplash answered ${response.status} for ${address.pathname}`),
    );
  const parsed = answer.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success)
    throw new HttpError(ErrorCode.Internal, "Unsplash answered in an unexpected shape.", parsed.error);
  return parsed.data;
}

/**
 * One page of photos matching a search.
 *
 * @param query - What to search for, already trimmed and bounded.
 * @param page - Which page, from 1.
 */
export async function searchUnsplash(
  query: string,
  page: number,
): Promise<{ photos: UnsplashPhoto[]; hasMore: boolean }> {
  const address = new URL("/search/photos", API_ORIGIN);
  address.searchParams.set("query", query);
  address.searchParams.set("page", String(page));
  address.searchParams.set("per_page", String(PER_PAGE));
  address.searchParams.set("content_filter", "high");
  const answer = await ask(address, searchAnswer);
  return { photos: answer.results, hasMore: page < answer.total_pages };
}

/**
 * One photo, read from Unsplash rather than taken from the browser.
 *
 * @param photoId - Unsplash's id for it.
 */
export async function readUnsplashPhoto(photoId: string): Promise<UnsplashPhoto> {
  return ask(new URL(`/photos/${encodeURIComponent(photoId)}`, API_ORIGIN), photo);
}

/**
 * Tells Unsplash a photo was used, which its guidelines require whenever one is
 * placed somewhere.
 *
 * @param downloadLocation - The photo's `links.download_location`, already
 *   checked to be on `api.unsplash.com`, with its own query kept.
 */
export async function trackUnsplashDownload(downloadLocation: string): Promise<void> {
  await ask(new URL(downloadLocation), z.unknown());
}

/**
 * A hotlinked address for a photo at one width.
 *
 * Only the imgix parameters Unsplash documents are set, and the `ixid` the raw
 * address carries stays, because that is what reports the view.
 *
 * @param imageUrl - The photo's `urls.raw`.
 * @param width - The width to ask for, in pixels.
 */
export function unsplashImageUrl(imageUrl: string, width: number): string {
  const url = new URL(imageUrl);
  url.searchParams.set("w", String(width));
  url.searchParams.set("fit", "max");
  url.searchParams.set("q", "80");
  url.searchParams.set("auto", "format");
  return url.href;
}

/**
 * A `srcset` for a photo at the widths the site's own pictures are derived at.
 *
 * A photo narrower than the smallest of them is offered at its own width.
 *
 * @param imageUrl - The photo's `urls.raw`.
 * @param width - The photo's own width, which no candidate exceeds.
 */
export function unsplashSrcSet(imageUrl: string, width: number): string {
  const widths: number[] = IMAGE_WIDTHS.filter((step) => step <= width);
  return (widths.length ? widths : [width])
    .map((step) => `${unsplashImageUrl(imageUrl, step)} ${step}w`)
    .join(", ");
}
