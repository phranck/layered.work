import { Card } from "@layered/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ActionButton } from "./action-button.js";
import { useDashboardLanguage } from "./language-context.js";
import { noRows, QueryStates } from "./query-states.js";
import { useSession } from "./session-queries.js";

/** Props for a card listing records only the owner changes. */
interface ListCardProps<Item> {
  /** The list's name, beside the number of its records. */
  title: string;
  /** The records. */
  query: UseQueryResult<readonly Item[]>;
  /** The label of the button that adds a record. */
  newLabel: string;
  onNew: () => void;
  /** What the card says while there is no record. */
  empty: string;
  /** Draws the records, told whether the signed-in account may change them. */
  children: (items: readonly Item[], owner: boolean) => ReactNode;
}

/**
 * A card listing records that every account sees and only the owner changes,
 * such as the navigations, the social accounts and the named values: the name
 * and the count with the button that adds one, the records through every state
 * of their query, and for anybody but the owner a footer saying why nothing can
 * be changed.
 */
export function ListCard<Item>({ title, query, newLabel, onNew, empty, children }: ListCardProps<Item>) {
  const { text } = useDashboardLanguage();
  const owner = useSession().data?.role === "owner";
  return (
    <Card>
      <Card.Header
        title={title}
        meta={query.data?.length}
        actions={
          <ActionButton action="new" tone="primary" disabled={!owner} onClick={onNew}>
            {newLabel}
          </ActionButton>
        }
      />
      <QueryStates query={query} empty={empty} isEmpty={noRows}>
        {(items) => children(items, owner)}
      </QueryStates>
      {!owner && <Card.Footer note={text("ownerOnly")} />}
    </Card>
  );
}
