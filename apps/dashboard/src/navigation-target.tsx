import { NAVIGATION_HREF_MAX_LENGTH, type SaveFooterNavigationBody } from "@layered/schemas";
import { Field, Input, Select } from "@layered/ui";
import { useState } from "react";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import {
  type TargetKind,
  targetKindOf,
  targetOptions,
  useNavigationTargetEntries,
} from "./navigation-query.js";
import { useTopics } from "./topics-query.js";

/** One link of a group, as the editor holds it. */
type Item = SaveFooterNavigationBody["items"][number];

/**
 * Where a link points: an address typed in, an entry, or a topic. Entries and
 * topics are asked for only once the link points at one of them.
 *
 * @param item - The link.
 * @param itemKey - The link's key in the editor, which the fields' ids are made from.
 * @param onChange - Replaces part of the link. Choosing another kind of target clears the old one.
 */
export function NavigationTarget({
  item,
  itemKey,
  onChange,
}: {
  item: Item;
  itemKey: string;
  onChange: (change: Partial<Item>) => void;
}) {
  const { text, language } = useDashboardLanguage();
  const [kind, setKind] = useState<TargetKind>(() => targetKindOf(item));
  const entries = useNavigationTargetEntries(kind === "entry");
  const topics = useTopics(kind === "topic");
  const selected = item.entryId ?? item.topicId ?? "";
  const options =
    kind === "external"
      ? []
      : targetOptions(kind, entries.data, topics.data, language, selected, text("navigationBroken"));
  return (
    <>
      <Field label={text("navigationTarget")} htmlFor={`navigation-${itemKey}-kind`}>
        <Select
          id={`navigation-${itemKey}-kind`}
          value={kind}
          options={[
            { value: "external", label: text("navigationAddress") },
            { value: "entry", label: text("searchEntries") },
            { value: "topic", label: text("tags") },
          ]}
          onChange={(event) => {
            setKind(event.target.value as TargetKind);
            onChange({ href: null, entryId: null, topicId: null });
          }}
        />
      </Field>
      {kind === "external" ? (
        <Field label={text("navigationAddress")} htmlFor={`navigation-${itemKey}-href`}>
          <Input
            id={`navigation-${itemKey}-href`}
            value={item.href ?? ""}
            maxLength={NAVIGATION_HREF_MAX_LENGTH}
            onChange={(event) => onChange({ href: event.target.value || null })}
          />
        </Field>
      ) : (
        <Field label={text("navigationChooseTarget")} htmlFor={`navigation-${itemKey}-target`}>
          <Select
            id={`navigation-${itemKey}-target`}
            value={selected}
            options={[{ value: "", label: text("navigationChooseTarget") }, ...options]}
            onChange={(event) =>
              onChange(
                kind === "entry"
                  ? { entryId: event.target.value || null }
                  : { topicId: event.target.value || null },
              )
            }
          />
        </Field>
      )}
      {entries.isError && <ErrorNotice error={entries.error} />}
      {topics.isError && <ErrorNotice error={topics.error} />}
    </>
  );
}
