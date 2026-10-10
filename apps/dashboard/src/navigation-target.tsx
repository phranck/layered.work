import { NAVIGATION_HREF_MAX_LENGTH, type SaveFooterNavigationBody } from "@layered/schemas";
import { Field, Input, Select } from "@layered/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { queryKeys } from "./query-keys.js";

type Item = SaveFooterNavigationBody["items"][number];
export function NavigationTarget({
  item,
  itemKey,
  onChange,
}: {
  item: Item;
  itemKey: string;
  onChange: (change: Partial<Item>) => void;
}) {
  const api = useDashboardApi();
  const { text, language } = useDashboardLanguage();
  const [kind, setKind] = useState(item.entryId ? "entry" : item.topicId ? "topic" : "external");
  const entries = useQuery({
    queryKey: queryKeys.navigationTargetEntries,
    enabled: kind === "entry",
    queryFn: async () =>
      (await Promise.all([api.fetchEntries("post"), api.fetchEntries("page"), api.fetchEntries("project")]))
        .flat()
        .filter((row) => !row.trashed),
  });
  const topics = useQuery({
    queryKey: queryKeys.topics,
    queryFn: api.fetchTopics,
    enabled: kind === "topic",
  });
  const options =
    kind === "entry"
      ? [
          ...new Map(
            entries.data?.map((row) => [row.entryId, { value: row.entryId, label: row.title }]),
          ).values(),
        ]
      : (topics.data?.map((row) => ({
          value: row.id,
          label: row[language]?.name ?? row.en?.name ?? row.de?.name ?? row.id,
        })) ?? []);
  const selected = item.entryId ?? item.topicId ?? "";
  if (selected && !options.some((option) => option.value === selected))
    options.push({ value: selected, label: text("navigationBroken") });
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
            setKind(event.target.value);
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
