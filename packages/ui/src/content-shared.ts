import type { ComponentName, PropsOf } from "@layered/content";
import type { MediaCreditLine } from "@layered/schemas";
import { SPACE_STEPS } from "@layered/tokens";
import type { CSSProperties, ReactNode } from "react";

/** Registered parameters with a React body in place of the framework-neutral body. */
export type ContentProps<N extends ComponentName> = Omit<PropsOf<N>, "children"> & { children?: ReactNode };

/** A media-library record, resolved by slug in the caller's language. */
export interface MediaAsset {
  src: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  srcSet?: string;
  /** Caller-provided layout widths for responsive image selection. */
  sizes?: string;
  /** A small raster data URL shown before the full image finishes loading. */
  placeholder?: string;
  /** The real entry or library picture shown before an interactive model loads. */
  poster?: string;
  mime?: string;
  filename?: string;
  focalPoint?: { x: number; y: number };
  /** Optional real WebVTT tracks supplied by the library, never fabricated. */
  captions?: { src: string; language: string; label: string }[];
  /** Who made a picture that comes from a picture library elsewhere, which every surface showing it names. */
  credit?: MediaCreditLine;
}

/** Resolve a library slug without coupling UI to storage or an API. */
export type MediaResolver = (slug: string) => MediaAsset | undefined;
/** The library supplied to a media component. */
export interface MediaProps {
  media: MediaResolver;
}
export type ContentUrlResolver = (url: string) => string;

/** Allow web navigation and relative assets, never executable or opaque URL schemes. */
export function contentUrl(
  value: string | undefined,
  asset = false,
  resolveUrl?: ContentUrlResolver,
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const url = value.trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject browser-normalized control characters in authored URLs.
  if (/[\u0000-\u0020\u007f\\]/.test(url)) return undefined;
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (protocol && !(asset ? ["http", "https"] : ["http", "https", "mailto", "tel"]).includes(protocol))
    return undefined;
  // Validate before handing an authored destination to a caller's URL resolver.
  if (!URL.canParse(url, "https://content.invalid/")) return undefined;
  return resolveUrl ? contentUrl(resolveUrl(url), asset) : url;
}

/** A validated token reference; content never supplies arbitrary CSS. */
export function contentSpacing(value: unknown): CSSProperties {
  const step = SPACE_STEPS.find((entry) => entry === String(value));
  return step ? ({ "--content-gap": `var(--content-space-${step})` } as CSSProperties) : {};
}

/** Equal columns are bounded by the language's column limits. */
export function contentColumns(value: unknown): CSSProperties {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6
    ? ({ "--content-columns": value } as CSSProperties)
    : {};
}

/**
 * Where a picture without a focal point is cropped around: its middle.
 *
 * The same value as `DEFAULT_FOCAL_POINT` in `@layered/schemas`, kept here
 * because this module runs in the site's islands, which do not load the
 * schemas. `content-shared.test.ts` holds the two together.
 */
const DEFAULT_FOCUS = { x: 0.5, y: 0.5 } as const;

/** One crop calculation for React and Astro image surfaces. */
export function imagePosition(asset: Pick<MediaAsset, "focalPoint">): string {
  const point = asset.focalPoint ?? DEFAULT_FOCUS;
  return `${point.x * 100}% ${point.y * 100}%`;
}
