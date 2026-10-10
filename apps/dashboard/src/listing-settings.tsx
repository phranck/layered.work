import { LISTING_BOUNDS, LISTING_GROUP, type ListedKind, listingSettings, MaxLength } from "@layered/schemas";
import { Field, Input, Segmented } from "@layered/ui";
import { useQuery } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { bilingualText, type DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { queryKeys } from "./query-keys.js";
import { SettingsCard } from "./settings.js";
import { useStoredChoice } from "./stored-choice.js";
import { Translated } from "./translated.js";

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

/** Whether a stored value says the card was left open. */
const restoredOpen = (stored: string | null) => stored === "true";

/** A whole number typed into a field, or NaN for one that is empty, which the schema refuses with its reason. */
const typedNumber = (value: string) => Number.parseInt(value, 10);

/**
 * @param kind - Which overview: posts or projects.
 */
export function ListingSettingsCard({ kind }: { kind: ListedKind }) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: api.fetchSettings });
  const [open, setOpen] = useStoredChoice(LISTING_SETTINGS_OPEN_KEY, restoredOpen);
  const group = LISTING_GROUP[kind];

  if (settings.isError) return <ErrorNotice error={settings.error} />;
  if (!settings.data) return null;
  const saved = settings.data[group];
  return (
    <Translated>
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
        headerActions={<Translated.Switch />}
      >
        {(draft, update, editable) => (
          <>
            <Translated.Field
              id={`${group}-headline`}
              label={text("listingHeadline")}
              hint={text("listingHeadlineHint")}
              value={draft.headline}
              placeholder={bilingualText(DEFAULT_HEADLINE[kind])}
              maxLength={MaxLength.Line}
              disabled={!editable}
              onChange={(headline) => update({ headline })}
            />
            <Translated.Field
              id={`${group}-introduction`}
              label={text("listingIntroduction")}
              hint={text("listingIntroductionHint")}
              value={draft.introduction}
              multiline
              maxLength={MaxLength.Paragraph}
              disabled={!editable}
              onChange={(introduction) => update({ introduction })}
            />
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
                hint={text(
                  "listingRange",
                  LISTING_BOUNDS.previewLength.min,
                  LISTING_BOUNDS.previewLength.max,
                )}
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
    </Translated>
  );
}
