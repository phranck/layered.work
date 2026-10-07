import type { Finding } from "@layered/content";
import {
  type EntryDetail,
  PUBLICATION_STATES,
  type PublicationState,
  READING_WIDTHS,
  type ReadingWidth,
  type SaveEntryBody,
} from "@layered/schemas";
import { Button, Choice, Editor, Field, Segmented, Switch } from "@layered/ui";
import { EyeIcon, PlusIcon, TrashIcon } from "@layered/ui/icons";
import { useLinkClickHandler } from "react-router";
import { AddressField } from "./address-field.js";
import { ContentFindings } from "./content-findings.js";
import type { CheckedContent } from "./content-validation.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { LANGUAGE_TEXT, otherLanguage, STATE_TONE } from "./entry-list.js";
import { SpecsField } from "./entry-specs.js";
import { useDashboardLanguage } from "./language-context.js";
import type { DashboardArea } from "./routes.js";
import { TopicField } from "./topic-field.js";

/**
 * About how many characters a line holds at each reading width, measured on
 * the site's body size: 56ch, 68ch and 82ch render as about 68, 82 and 99.
 */
const READING_WIDTH_CHARACTERS: Record<ReadingWidth, number | null> = {
  narrow: 68,
  normal: 82,
  wide: 99,
  full: null,
};

/** The labels the reading widths are offered under: sizes, since four words do not fit side by side. */
const READING_WIDTH_LABELS: Record<ReadingWidth, string> = {
  narrow: "S",
  normal: "M",
  wide: "L",
  full: "XL",
};

/** Each state's word and its line of explanation. Its tone is `STATE_TONE`. */
const STATE_OPTIONS: Record<PublicationState, { label: DashboardStringKey; note: DashboardStringKey }> = {
  public: { label: "statePublic", note: "statePublicNote" },
  draft: { label: "stateDraft", note: "stateDraftNote" },
  hidden: { label: "stateHidden", note: "stateHiddenNote" },
};

export function EntryProperties({
  entry,
  draft,
  checked,
  area,
  update,
  previewPending,
  openPreview,
  translationPending,
  onTranslate,
  onTrash,
  onSelectFinding,
}: {
  entry: EntryDetail;
  draft: SaveEntryBody;
  checked: CheckedContent;
  area: DashboardArea;
  update: (change: Partial<SaveEntryBody>) => void;
  previewPending: boolean;
  openPreview: () => void;
  translationPending: boolean;
  onTranslate: () => void;
  onTrash: () => void;
  onSelectFinding: (finding: Finding) => void;
}) {
  const { text } = useDashboardLanguage();
  const counterpartPath = entry.counterpart ? `/${area.path}/${entry.counterpart.id}` : undefined;
  const openCounterpart = useLinkClickHandler(counterpartPath ?? `/${area.path}`);
  return (
    <Editor.Panel title={text("editorPublication")}>
      <ContentFindings
        checked={checked}
        source={draft.body}
        onSelect={(finding) => onSelectFinding(finding)}
      />
      <Field label={text("editorState")}>
        <Choice
          aria-label={text("editorState")}
          value={draft.state}
          onValueChange={(value) => update({ state: value as PublicationState })}
        >
          {PUBLICATION_STATES.map((state) => (
            <Choice.Option
              key={state}
              value={state}
              label={text(STATE_OPTIONS[state].label)}
              note={text(STATE_OPTIONS[state].note)}
              tone={STATE_TONE[state]}
            />
          ))}
        </Choice>
      </Field>
      {/* Under the state, because what a reader would see is the question the
              state raises, whichever state it is. */}
      <div className="entry-editor__action">
        <Button icon={<EyeIcon weight="duotone" />} disabled={previewPending} onClick={openPreview}>
          {previewPending ? text("previewPending") : text("preview")}
        </Button>
      </div>
      <Field label={text("editorSlug")} htmlFor="entry-address">
        <AddressField
          inputId="entry-address"
          path={entry.path}
          language={entry.language}
          title={draft.title}
          value={draft.slug}
          onChange={(slug) => update({ slug })}
        />
      </Field>
      <Field label={text("editorLanguage")}>
        <span className="entry-editor__value">
          <span className="lang-tag" data-language={entry.language}>
            {entry.language}
          </span>
          {text(LANGUAGE_TEXT[entry.language])}
        </span>
      </Field>
      <Field label={text("editorTranslation")}>
        {entry.counterpart && counterpartPath ? (
          <a
            className="entry-editor__link"
            href={counterpartPath}
            onClick={openCounterpart}
            lang={entry.counterpart.language}
          >
            <span className="lang-tag" data-language={entry.counterpart.language}>
              {entry.counterpart.language}
            </span>
            {text("editorOpenCounterpart", entry.counterpart.title)}
          </a>
        ) : entry.counterpartTrashed ? (
          <span className="entry-editor__note">
            {text("editorTranslationInTrash", text(LANGUAGE_TEXT[otherLanguage(entry.language)]))}
          </span>
        ) : (
          <>
            <span className="entry-editor__note">{text("editorTranslationNone")}</span>
            <Button icon={<PlusIcon weight="duotone" />} disabled={translationPending} onClick={onTranslate}>
              {translationPending
                ? text("editorCreateCounterpartPending")
                : text("editorCreateCounterpart", text(LANGUAGE_TEXT[otherLanguage(entry.language)]))}
            </Button>
          </>
        )}
      </Field>
      {/* Only whilst there is no other language to show instead. */}
      {!entry.counterpart && (
        <Field
          label={text("editorShowInOtherLanguage", text(LANGUAGE_TEXT[otherLanguage(entry.language)]))}
          htmlFor="entry-show-in-other-language"
          hint={text("editorShowInOtherLanguageHint", text(LANGUAGE_TEXT[otherLanguage(entry.language)]))}
        >
          <Switch
            id="entry-show-in-other-language"
            aria-label={text("editorShowInOtherLanguage", text(LANGUAGE_TEXT[otherLanguage(entry.language)]))}
            checked={draft.showInOtherLanguage}
            onCheckedChange={(showInOtherLanguage) => update({ showInOtherLanguage })}
          />
        </Field>
      )}
      <Field
        label={text("readingWidth")}
        hint={text("readingWidthHint", READING_WIDTH_CHARACTERS[draft.readingWidth])}
      >
        <Segmented
          aria-label={text("readingWidth")}
          value={draft.readingWidth}
          options={READING_WIDTHS.map((width) => ({ value: width, label: READING_WIDTH_LABELS[width] }))}
          onValueChange={(value) => update({ readingWidth: value as ReadingWidth })}
        />
      </Field>
      <Field label={text("editorTopics")} htmlFor="entry-topics">
        <TopicField
          inputId="entry-topics"
          language={entry.language}
          value={draft.topicIds}
          onChange={(topicIds) => update({ topicIds })}
        />
      </Field>
      {/* Only a project page shows the pairs, so nothing else is offered them. */}
      {entry.kind === "project" && <SpecsField specs={draft.specs} onChange={(specs) => update({ specs })} />}
      {!entry.trashed && (
        <div className="entry-editor__action entry-editor__action--apart">
          <Button tone="danger" icon={<TrashIcon />} onClick={onTrash}>
            {text("trash")}
          </Button>
        </div>
      )}
    </Editor.Panel>
  );
}
