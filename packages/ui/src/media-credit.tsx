import { contentUrl, type MediaCreditLine } from "./content-shared.js";

/** Props for a picture's credit line. */
export interface MediaCreditProps {
  credit: MediaCreditLine;
  /**
   * Lays the line over the corner of a framed picture rather than under it, for
   * a hero, a card or any frame with no room below.
   */
  overlay?: boolean;
  /**
   * Whether the names are links. A picture inside a link, such as a card, cannot
   * hold another one, so there the line is text and the page it leads to carries
   * the linked credit.
   */
  linked?: boolean;
}

/**
 * The credit line of a picture from a picture library elsewhere, such as
 * Unsplash, whose terms require the author and the library to be named and
 * linked wherever the picture is shown.
 */
export function MediaCredit({ credit, overlay = false, linked = true }: MediaCreditProps) {
  const name = (label: string, address: string) => {
    const href = linked ? contentUrl(address) : undefined;
    return href ? <a href={href}>{label}</a> : label;
  };
  return (
    <small className={overlay ? "media-credit media-credit--overlay" : "media-credit"}>
      {credit.lead} {name(credit.author, credit.authorUrl)} {credit.joiner}{" "}
      {name(credit.source, credit.sourceUrl)}
    </small>
  );
}
