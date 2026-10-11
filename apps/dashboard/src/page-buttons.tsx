import { ActionButton } from "./action-button.js";
import { useDashboardLanguage } from "./language-context.js";

/**
 * The buttons that step through a list the API delivers a page at a time, for
 * a card's footer: back while there is a page before this one, on while the API
 * says there is more. Each is left out rather than disabled where it has
 * nowhere to go, as the media library and the Unsplash search both need.
 *
 * @param page - The page shown, counted from 1.
 * @param hasMore - Whether the API has a page after this one.
 * @param onPage - Called with the page to show next.
 */
export function PageButtons({
  page,
  hasMore,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  onPage: (page: number) => void;
}) {
  const { text } = useDashboardLanguage();
  return (
    <>
      {page > 1 && (
        <ActionButton action="previousPage" onClick={() => onPage(page - 1)}>
          {text("previousPage")}
        </ActionButton>
      )}
      {hasMore && (
        <ActionButton action="nextPage" onClick={() => onPage(page + 1)}>
          {text("nextPage")}
        </ActionButton>
      )}
    </>
  );
}
