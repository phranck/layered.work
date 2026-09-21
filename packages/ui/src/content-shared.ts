import type { ComponentName, PropsOf } from "@layered/content";
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
  mime?: string;
  filename?: string;
  focalPoint?: { x: number; y: number };
  /** Optional real WebVTT tracks supplied by the library, never fabricated. */
  captions?: { src: string; language: string; label: string }[];
}
/** Resolve a library slug without coupling UI to storage or an API. */
export type MediaResolver = (slug: string) => MediaAsset | undefined;
/** The library supplied to a media component. */
export interface MediaProps {
  media: MediaResolver;
}

/** Allow web navigation and relative assets, never executable or opaque URL schemes. */
export function contentUrl(value: string | undefined, asset = false): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const url = value.trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject browser-normalized control characters in authored URLs.
  if (/[\u0000-\u0020\u007f\\]/.test(url)) return undefined;
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (protocol && !(asset ? ["http", "https"] : ["http", "https", "mailto", "tel"]).includes(protocol))
    return undefined;
  return url;
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
