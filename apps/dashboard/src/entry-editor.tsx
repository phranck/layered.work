import {
  type ContentLanguage,
  type EntryDetail,
  type EntryKind,
  MaxLength,
  PUBLICATION_STATES,
  type PublicationState,
  READING_WIDTHS,
  type ReadingWidth,
  type SaveEntryBody,
} from "@layered/schemas";
import { Button, Card, Choice, Editor, Field, Input, Section, Segmented } from "@layered/ui";
import {
  ArrowLeftIcon,
  CodeIcon,
  FloppyDiskIcon,
  GlobeIcon,
  LinkIcon,
  ListBulletsIcon,
  QuotesIcon,
  TextBIcon,
  TextHTwoIcon,
  TextItalicIcon,
  XIcon,
} from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useLinkClickHandler, useParams } from "react-router";
import { ContentEditor, type ContentEditorHandle } from "./content-editor.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { COMPONENT_GROUPS, COMPONENT_ICONS, componentSnippet } from "./editor-toolbar.js";
import { entryListKey } from "./entry-list.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
import type { DashboardArea } from "./routes.js";

/**
 * Where an entry is written, with everything decided about it in the panel
 * beside the text.
 *
 * The list is gone whilst an entry is open, because nobody edits a post whilst
 * looking at a table of all the others. The way back stands where the list's
 * heading stood, so the heading of the entry does not move when it opens.
 */

/** How long typing has to pause before a draft is saved by itself, in milliseconds. */
const AUTOSAVE_DELAY_MS = 2000;

/** The query an open entry is cached under. */
const entryKey = (id: string) => ["entry", id] as const;

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

/** Each state's word, its line of explanation, and the status tone its mark takes. */
const STATE_OPTIONS: Record<
  PublicationState,
  { label: DashboardStringKey; note: DashboardStringKey; tone: "success" | "warning" | "info" }
> = {
  public: { label: "statePublic", note: "statePublicNote", tone: "success" },
  draft: { label: "stateDraft", note: "stateDraftNote", tone: "warning" },
  hidden: { label: "stateHidden", note: "stateHiddenNote", tone: "info" },
};

/** The name of each language, in the interface language. */
const LANGUAGE_TEXT: Record<ContentLanguage, DashboardStringKey> = { en: "languageEn", de: "languageDe" };

/** What the editor changes, taken out of what it opened. */
function draftOf(entry: EntryDetail): SaveEntryBody {
  return {
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    state: entry.state,
    readingWidth: entry.readingWidth,
  };
}

/** Whether two drafts say the same thing. Compared field by field, never by serialising. */
function sameDraft(first: SaveEntryBody, second: SaveEntryBody): boolean {
  return (Object.keys(first) as (keyof SaveEntryBody)[]).every((key) => first[key] === second[key]);
}

/**
 * The entry an address names, once it has loaded.
 *
 * @param area - The list this entry belongs to, for the way back.
 * @param kind - Which kind of entry the list holds, so a save refreshes it.
 */
export function EntryEditorScreen({ area, kind }: { area: DashboardArea; kind: EntryKind }) {
  const { id = "" } = useParams();
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const entry = useQuery({ queryKey: entryKey(id), queryFn: () => api.fetchEntry(id) });
  if (entry.isError) {
    return (
      <Section>
        <BackToList area={area} />
        <ErrorNotice error={entry.error} />
      </Section>
    );
  }
  if (!entry.data)
    return <Section.Title eyebrow={<BackToList area={area} />} title={text("loading")} level={1} />;
  // Keyed by the translation, so opening another one starts a fresh draft.
  return <EntryEditor key={entry.data.id} area={area} kind={kind} entry={entry.data} />;
}

/** The way back to the list, standing where the list's eyebrow stood. */
function BackToList({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  const to = `/${area.path}`;
  const onClick = useLinkClickHandler(to);
  return (
    <a className="workbench-back" href={to} onClick={onClick}>
      <ArrowLeftIcon aria-hidden="true" />
      {text(area.labelKey)}
    </a>
  );
}

/**
 * The editor for one translation.
 *
 * A draft saves itself whilst it is a draft, because nothing a reader sees
 * depends on it. Anything already public or hidden is saved by hand, because a
 * save there changes what readers get, and half a sentence must not reach them
 * by itself. Leaving with something unsaved asks first, inside the dashboard
 * and when the tab closes.
 */
function EntryEditor({ area, kind, entry }: { area: DashboardArea; kind: EntryKind; entry: EntryDetail }) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { language, text } = useDashboardLanguage();
  const editor = useRef<ContentEditorHandle>(null);
  const [saved, setSaved] = useState(() => draftOf(entry));
  const [draft, setDraft] = useState(saved);
  const [savedAt, setSavedAt] = useState<{ at: Date; automatic: boolean }>();
  const dirty = !sameDraft(draft, saved);
  const times = useMemo(() => new Intl.DateTimeFormat(language, { timeStyle: "short" }), [language]);

  const save = useMutation({
    mutationFn: ({ value }: { value: SaveEntryBody; automatic: boolean }) => api.saveEntry(entry.id, value),
    onSuccess: (stored, { automatic }) => {
      const now = draftOf(stored);
      setSaved(now);
      setSavedAt({ at: new Date(), automatic });
      queryClient.setQueryData(entryKey(entry.id), stored);
      void queryClient.invalidateQueries({ queryKey: entryListKey(kind) });
    },
  });

  // A draft saves itself once typing pauses. Only when both what is stored and
  // what is being written are drafts, so choosing "public" is never saved by
  // waiting.
  const autosaving = saved.state === "draft" && draft.state === "draft" && dirty && !save.isPending;
  useEffect(() => {
    if (!autosaving) return;
    const timer = setTimeout(() => save.mutate({ value: draft, automatic: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autosaving, draft, save]);

  // Closing the tab or reloading with something unsaved asks the browser's own question.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Leaving inside the dashboard asks the dashboard's own question.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const update = (change: Partial<SaveEntryBody>) => setDraft((current) => ({ ...current, ...change }));
  const counterpartPath = entry.counterpart ? `/${area.path}/${entry.counterpart.id}` : undefined;
  const openCounterpart = useLinkClickHandler(counterpartPath ?? `/${area.path}`);

  const status = save.isPending
    ? text("savePending")
    : dirty
      ? text("unsavedChanges")
      : savedAt
        ? text(savedAt.automatic ? "autosavedAt" : "savedAt", times.format(savedAt.at))
        : "";

  return (
    <>
      <Section.Title
        eyebrow={<BackToList area={area} />}
        title={draft.title.trim() || text("editorTitleMissing")}
        level={1}
      />
      <Editor>
        <Editor.Main>
          <Field label={text("editorTitle")} htmlFor="entry-title">
            <Input
              id="entry-title"
              value={draft.title}
              maxLength={MaxLength.Line}
              lang={entry.language}
              onChange={(event) => update({ title: event.target.value })}
            />
          </Field>
          <Editor.Toolbar
            aria-label={text("editorTools")}
            role="toolbar"
            groups={[
              [
                <Editor.Tool
                  key="h2"
                  label={text("toolHeading")}
                  icon={<TextHTwoIcon />}
                  onClick={() => editor.current?.prefixLines("## ")}
                />,
                <Editor.Tool
                  key="bold"
                  label={text("toolBold")}
                  icon={<TextBIcon />}
                  onClick={() => editor.current?.wrap("**", "**", text("toolPlaceholder"))}
                />,
                <Editor.Tool
                  key="italic"
                  label={text("toolItalic")}
                  icon={<TextItalicIcon />}
                  onClick={() => editor.current?.wrap("_", "_", text("toolPlaceholder"))}
                />,
              ],
              [
                <Editor.Tool
                  key="quote"
                  label={text("toolQuote")}
                  icon={<QuotesIcon />}
                  onClick={() => editor.current?.prefixLines("> ")}
                />,
                <Editor.Tool
                  key="list"
                  label={text("toolList")}
                  icon={<ListBulletsIcon />}
                  onClick={() => editor.current?.prefixLines("- ")}
                />,
                <Editor.Tool
                  key="link"
                  label={text("toolLink")}
                  icon={<LinkIcon />}
                  onClick={() => editor.current?.wrap("[", "](https://)", text("toolLinkText"))}
                />,
                <Editor.Tool
                  key="code"
                  label={text("toolCode")}
                  icon={<CodeIcon />}
                  onClick={() => editor.current?.wrap("`", "`", text("toolPlaceholder"))}
                />,
              ],
              ...COMPONENT_GROUPS.map((group) =>
                group.map((name) => {
                  const Icon = COMPONENT_ICONS[name];
                  return (
                    <Editor.Tool
                      key={name}
                      label={name}
                      icon={<Icon />}
                      onClick={() => editor.current?.insertBlock(componentSnippet(name))}
                    />
                  );
                }),
              ),
            ]}
          />
          <Editor.Surface>
            <ContentEditor
              editorRef={editor}
              value={draft.body}
              label={text("editorText")}
              onChange={(body) => update({ body })}
            />
          </Editor.Surface>
          {save.isError && <ErrorNotice error={save.error} />}
          <Editor.Actions
            destructive={
              <span className="entry-editor__status" role="status">
                {status}
              </span>
            }
          >
            <Button
              tone={saved.state === "public" && draft.state === "public" ? "primary" : "secondary"}
              disabled={!dirty || save.isPending}
              icon={<FloppyDiskIcon weight="duotone" />}
              onClick={() => save.mutate({ value: draft, automatic: false })}
            >
              {text("save")}
            </Button>
            {!(saved.state === "public" && draft.state === "public") && (
              <Button
                tone="primary"
                disabled={save.isPending}
                icon={<GlobeIcon weight="duotone" />}
                onClick={() => {
                  // The draft takes the new state as well, so what is shown and
                  // what is stored agree once the save returns.
                  const value: SaveEntryBody = { ...draft, state: "public" };
                  setDraft(value);
                  save.mutate({ value, automatic: false });
                }}
              >
                {save.isPending ? text("publishPending") : text("publish")}
              </Button>
            )}
          </Editor.Actions>
        </Editor.Main>
        <Editor.Panel title={text("editorPublication")}>
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
                  tone={STATE_OPTIONS[state].tone}
                />
              ))}
            </Choice>
          </Field>
          <Field label={text("editorLanguage")}>
            <span className="entry-editor__value">
              <span className="lang-tag" data-language={entry.language}>
                {entry.language}
              </span>
              {text(LANGUAGE_TEXT[entry.language])}
            </span>
          </Field>
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
            ) : (
              <span className="entry-editor__note">{text("editorTranslationNone")}</span>
            )}
          </Field>
          <Field label={text("editorTopics")}>
            {entry.topics.length > 0 ? (
              <span className="entry-editor__topics">
                {entry.topics.map((topic) => (
                  <span key={topic.id} className="chip">
                    {topic.name}
                  </span>
                ))}
              </span>
            ) : (
              <span className="entry-editor__note">{text("editorTopicsNone")}</span>
            )}
          </Field>
        </Editor.Panel>
      </Editor>
      {blocker.state === "blocked" && (
        <CardDialog labelId="leave-entry-title" onClose={() => blocker.reset()}>
          <Card.Header id="leave-entry-title" title={text("leaveTitle")} />
          <Card.Body>
            <p>{text("leaveBody")}</p>
          </Card.Body>
          <Card.Footer
            actions={
              <>
                <Button tone="danger" icon={<XIcon weight="duotone" />} onClick={() => blocker.proceed()}>
                  {text("discard")}
                </Button>
                <Button
                  tone="primary"
                  icon={<ArrowLeftIcon weight="duotone" />}
                  onClick={() => blocker.reset()}
                  autoFocus
                >
                  {text("stay")}
                </Button>
              </>
            }
          />
        </CardDialog>
      )}
    </>
  );
}
