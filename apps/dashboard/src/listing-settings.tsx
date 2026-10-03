import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  LISTING_BOUNDS,
  LISTING_GROUP,
  type ListedKind,
  listingSettings,
  MaxLength,
} from "@layered/schemas";
import { Field, Input, Segmented, Textarea } from "@layered/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { type DashboardStringKey, dashboardText } from "./dashboard-i18n.js";
import { LANGUAGE_TEXT } from "./entry-list.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { SETTINGS_KEY, SettingsCard } from "./settings.js";

/**
 * How the site's overview of posts or of projects is set up, in a card on the
 * dashboard's list of the same kind, between its figures and its table.
 *
 * The card is closed until it is opened, because the list is what the screen
 * is for, and whether it is open is kept in this browser for every list alike.
 */

/** Where the card's open state is kept between visits. */
export const LISTING_SETTINGS_OPEN_KEY = "layered:dashboard:listing-settings-open";

/** Each overview's name, as the site shows it where no headline is set. */
const DEFAULT_HEADLINE: Record<ListedKind, DashboardStringKey> = { post: "posts", project: "projects" };

/** Whether the card was left open, where the browser allows reading it. */
function readOpen(): boolean {
  try {
    return window.localStorage.getItem(LISTING_SETTINGS_OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

/** The card's open state, kept for the next visit. */
function useRememberedOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(readOpen);
  const change = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(LISTING_SETTINGS_OPEN_KEY, String(next));
    } catch {
      // The card still opens and closes for this visit.
    }
  };
  return [open, change];
}

/** A whole number typed into a field, or NaN for one that is empty, which the schema refuses with its reason. */
const typedNumber = (value: string) => Number.parseInt(value, 10);

/**
 * @param kind - Which overview: posts or projects.
 */
export function ListingSettingsCard({ kind }: { kind: ListedKind }) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: api.fetchSettings });
  const [open, setOpen] = useRememberedOpen();
  const group = LISTING_GROUP[kind];
  const languageName = (language: ContentLanguage) => text(LANGUAGE_TEXT[language]);

  if (settings.isError) return <ErrorNotice error={settings.error} />;
  if (!settings.data) return null;
  const saved = settings.data[group];
  return (
    <SettingsCard
      key={JSON.stringify(saved)}
      group={group}
      title={text("listingSettings")}
      saved={saved}
      schema={listingSettings}
      reasons={{
        pageSize: "invalidPageSize",
        previewLength: "invalidPreviewLength",
        headline: "invalidListingText",
        introduction: "invalidListingText",
      }}
      collapse={{ open, onOpenChange: setOpen }}
    >
      {(draft, update, editable) => (
        <>
          <div className="settings-form__pair">
            {CONTENT_LANGUAGES.map((language) => (
              <Field
                key={language}
                label={text("listingHeadline", languageName(language))}
                htmlFor={`${group}-headline-${language}`}
                hint={language === "en" ? text("listingHeadlineHint") : undefined}
              >
                <Input
                  id={`${group}-headline-${language}`}
                  lang={language}
                  value={draft.headline[language]}
                  placeholder={dashboardText(language, DEFAULT_HEADLINE[kind])}
                  maxLength={MaxLength.Line}
                  disabled={!editable}
                  onChange={(event) =>
                    update({ headline: { ...draft.headline, [language]: event.target.value } })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="settings-form__pair">
            {CONTENT_LANGUAGES.map((language) => (
              <Field
                key={language}
                label={text("listingIntroduction", languageName(language))}
                htmlFor={`${group}-introduction-${language}`}
                hint={language === "en" ? text("listingIntroductionHint") : undefined}
              >
                <Textarea
                  id={`${group}-introduction-${language}`}
                  lang={language}
                  value={draft.introduction[language]}
                  maxLength={MaxLength.Paragraph}
                  disabled={!editable}
                  onChange={(event) =>
                    update({ introduction: { ...draft.introduction, [language]: event.target.value } })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="settings-form__trio">
            <Field
              label={text("listingPageSize")}
              htmlFor={`${group}-page-size`}
              hint={text("listingRange", LISTING_BOUNDS.pageSize.min, LISTING_BOUNDS.pageSize.max)}
            >
              <Input
                id={`${group}-page-size`}
                type="number"
                inputMode="numeric"
                min={LISTING_BOUNDS.pageSize.min}
                max={LISTING_BOUNDS.pageSize.max}
                value={Number.isNaN(draft.pageSize) ? "" : draft.pageSize}
                disabled={!editable}
                onChange={(event) => update({ pageSize: typedNumber(event.target.value) })}
              />
            </Field>
            <Field label={text("listingColumns")} hint={text("listingColumnsHint")}>
              <Segmented
                aria-label={text("listingColumns")}
                value={String(draft.columns)}
                options={Array.from(
                  { length: LISTING_BOUNDS.columns.max - LISTING_BOUNDS.columns.min + 1 },
                  (_, index) => {
                    const columns = String(LISTING_BOUNDS.columns.min + index);
                    return { value: columns, label: columns, disabled: !editable };
                  },
                )}
                onValueChange={(value) => update({ columns: Number(value) })}
              />
            </Field>
            <Field
              label={text("listingPreviewLength")}
              htmlFor={`${group}-preview-length`}
              hint={text("listingRange", LISTING_BOUNDS.previewLength.min, LISTING_BOUNDS.previewLength.max)}
            >
              <Input
                id={`${group}-preview-length`}
                type="number"
                inputMode="numeric"
                min={LISTING_BOUNDS.previewLength.min}
                max={LISTING_BOUNDS.previewLength.max}
                value={Number.isNaN(draft.previewLength) ? "" : draft.previewLength}
                disabled={!editable}
                onChange={(event) => update({ previewLength: typedNumber(event.target.value) })}
              />
            </Field>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
