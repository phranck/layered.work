import { Card } from "@layered/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";

/**
 * What a card says in place of its content while there is none to show: still
 * loading, nothing there, or nothing a search leaves.
 *
 * @param children - The sentence, in the interface language.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card.Body>
      <p className="unfinished">{children}</p>
    </Card.Body>
  );
}

/** Props for the states a card's query passes through. */
interface QueryStatesProps<Data> {
  /** The query the card draws. */
  query: UseQueryResult<Data>;
  /** What the card says once the answer has arrived and holds nothing, decided by `isEmpty`. */
  empty?: ReactNode;
  /** Whether an answer counts as holding nothing. A list does when it has no rows. */
  isEmpty?: (data: Data) => boolean;
  /** Draws the answer. */
  children: (data: Data) => ReactNode;
}

/**
 * A card's content through every state of its query, said the same way in
 * every card: a line while it loads, the failure where it failed, the empty
 * sentence where there is nothing, and the content once there is. A query
 * that has not been asked yet shows nothing.
 */
export function QueryStates<Data>({ query, empty, isEmpty, children }: QueryStatesProps<Data>) {
  const { text } = useDashboardLanguage();
  if (query.isError)
    return (
      <Card.Body>
        <ErrorNotice error={query.error} />
      </Card.Body>
    );
  // A query that waits to be asked, such as a search nobody has typed yet, has
  // nothing to say until it is.
  if (query.isPending)
    return query.fetchStatus === "idle" ? null : <EmptyState>{text("loading")}</EmptyState>;
  if (empty !== undefined && isEmpty?.(query.data)) return <EmptyState>{empty}</EmptyState>;
  return <>{children(query.data)}</>;
}

/** Whether a list holds no rows, the usual meaning of an empty answer. */
export const noRows = (rows: readonly unknown[]) => rows.length === 0;
