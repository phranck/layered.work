import type { MediaCreditLine } from "@layered/schemas";
import { contentUrl } from "./content-shared.js";

/** Props for the words of a picture's credit. */
export interface MediaCreditTextProps {
  credit: MediaCreditLine;
  /**
   * Whether the names are links. A picture inside a link, such as a card, cannot
   * hold another one, so there the line is text and the page it leads to carries
   * the linked credit.
   */
  linked?: boolean;
}

/** Props for a picture's credit line. */
export interface MediaCreditProps extends MediaCreditTextProps {
  /**
   * Lays the line over the corner of a framed picture rather than under it, for
   * a hero, a card or any frame with no room below.
   */
  overlay?: boolean;
}

/**
 * The words of a credit, the author and the library each named and linked, in
 * whatever line holds them: the site's credit line, or a hint in the dashboard
 * where the picture is described.
 */
function MediaCreditText({ credit, linked = true }: MediaCreditTextProps) {
  const name = (label: string, address: string) => {
    const href = linked ? contentUrl(address) : undefined;
    return href ? <a href={href}>{label}</a> : label;
  };
  return (
    <>
      {credit.lead} {name(credit.author, credit.authorUrl)} {credit.joiner}{" "}
      {name(credit.source, credit.sourceUrl)}
    </>
  );
}

/**
 * The credit line of a picture from a picture library elsewhere, such as
 * Unsplash, whose terms require the author and the library to be named and
 * linked wherever the picture is shown.
 */
function MediaCreditRoot({ credit, overlay = false, linked = true }: MediaCreditProps) {
  return (
    <small className={overlay ? "media-credit media-credit--overlay" : "media-credit"}>
      <MediaCreditText credit={credit} linked={linked} />
    </small>
  );
}

/** A picture's credit line, and its words alone as `MediaCredit.Text`. */
export const MediaCredit = Object.assign(MediaCreditRoot, { Text: MediaCreditText });
