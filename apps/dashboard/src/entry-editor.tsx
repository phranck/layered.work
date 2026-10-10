import { validateContent } from "@layered/content";
import {
  type EntryDetail,
  type EntryKind,
  entrySpecs,
  type SaveEntryBody,
  saveEntryBody,
} from "@layered/schemas";
import { Button, Card, Editor, Section } from "@layered/ui";
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  FloppyDiskIcon,
  GlobeIcon,
  XIcon,
} from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useLinkClickHandler, useLocation, useNavigate, useParams } from "react-router";
import { isSavableSlug } from "./address-field.js";
import { DashboardApiError } from "./api.js";
import { HeaderEnd, HeaderStart } from "./app-bar-slots.js";
import type { ContentEditorHandle } from "./content-editor.js";
import { type CheckedContent, contentIsPublishable } from "./content-validation.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { useEditorTextSize } from "./editor-text-size.js";
import { LANGUAGE_TEXT, otherLanguage } from "./entry-list.js";
import { EntryProperties } from "./entry-properties.js";
import { WritingSurface } from "./entry-writing.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog, ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import type { DashboardArea } from "./routes.js";
import { useSaveShortcut } from "./save-shortcut.js";

/**
 * Where an entry is written, with everything decided about it in the panel
 * beside the text.
 *
 * The list is gone whilst an entry is open, because nobody edits a post whilst
 * looking at a table of all the others. The way back stands at the start of the
 * dashboard's bar, and the state and the saving at its end.
 */

/** How long typing has to pause before a draft is saved by itself, in milliseconds. */
const AUTOSAVE_DELAY_MS = 2000;

/** What the editor changes, taken out of what it opened. */
function draftOf(entry: EntryDetail): SaveEntryBody {
  return {
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    state: entry.state,
    readingWidth: entry.readingWidth,
    showInOtherLanguage: entry.showInOtherLanguage,
    topicIds: entry.topics.map((topic) => topic.id),
    specs: entry.specs,
    slug: entry.slug,
  };
}

/**
 * Whether two drafts say the same thing. Compared field by field, never by
 * serialising: the topics as a set, because their order means nothing, and the
 * specification pair by pair, because its order is what the page shows.
 */
function sameDraft(first: SaveEntryBody, second: SaveEntryBody): boolean {
  const { topicIds: firstTopics, specs: firstSpecs, ...firstFields } = first;
  const { topicIds: secondTopics, specs: secondSpecs, ...secondFields } = second;
  const secondTopicIds = new Set(secondTopics);
  return (
    (Object.keys(firstFields) as (keyof typeof firstFields)[]).every(
      (key) => firstFields[key] === secondFields[key],
    ) &&
    firstTopics.length === secondTopics.length &&
    firstTopics.every((id) => secondTopicIds.has(id)) &&
    firstSpecs.length === secondSpecs.length &&
    firstSpecs.every(
      (pair, index) => pair.label === secondSpecs[index]?.label && pair.value === secondSpecs[index]?.value,
    )
  );
}

/**
 * The draft as a save would store it.
 *
 * The API trims a title, a summary, an address and every specification pair,
 * so a draft holding a trailing space differs from what its own save returns.
 * Compared as written, it would stay unsaved after every save, and a draft
 * would save itself again every two seconds for as long as it stays open. The
 * schema the API reads is applied here as well. A draft it refuses stays as it
 * is, which differs from anything stored.
 */
function asStored(draft: SaveEntryBody): SaveEntryBody {
  const parsed = saveEntryBody.safeParse(draft);
  return parsed.success ? parsed.data : draft;
}

/**
 * The entry an address names, once it has loaded.
 *
 * @param area - The list this entry belongs to, for the way back.
 * @param kind - Which kind of entry the list holds, so a save refreshes it.
 */
export function EntryEditorScreen({ area, kind }: { area: DashboardArea; kind: EntryKind }) {
  const { id = "" } = useParams();
  const location = useLocation();
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const entry = useQuery({ queryKey: queryKeys.entryDetail(id), queryFn: () => api.fetchEntry(id) });
  if (entry.isError) {
    return (
      <Section>
        <BackToList area={area} />
        <ErrorNotice error={entry.error} />
      </Section>
    );
  }
  if (!entry.data)
    return (
      <BackToList area={area}>
        <h1 className="app-bar-title">{text("loading")}</h1>
      </BackToList>
    );
  // Keyed by the translation, so opening another one starts a fresh draft.
  return (
    <EntryEditor
      key={entry.data.id}
      area={area}
      kind={kind}
      entry={entry.data}
      focusTitle={location.state?.focusTitle === true}
    />
  );
}

/**
 * The way back to the list, at the start of the dashboard's bar, with whatever
 * follows it there, such as the entry's title.
 */
function BackToList({ area, children }: { area: DashboardArea; children?: ReactNode }) {
  const { text } = useDashboardLanguage();
  const to = `/${area.path}`;
  const onClick = useLinkClickHandler(to);
  return (
    <HeaderStart>
      <Button.Link href={to} onClick={onClick} icon={<ArrowLeftIcon />}>
        {text(area.labelKey)}
      </Button.Link>
      {children}
    </HeaderStart>
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
function EntryEditor({
  area,
  kind,
  entry,
  focusTitle = false,
}: {
  area: DashboardArea;
  kind: EntryKind;
  entry: EntryDetail;
  focusTitle?: boolean;
}) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { language, text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const editor = useRef<ContentEditorHandle>(null);
  const navigate = useNavigate();
  const [textSize, setTextSize] = useEditorTextSize();
  const [saved, setSaved] = useState(() => draftOf(entry));
  const [draft, setDraft] = useState(saved);
  const [checked, setChecked] = useState<CheckedContent>(() => ({
    source: saved.body,
    validation: validateContent(saved.body),
  }));
  const publishable = contentIsPublishable(draft.body, checked);
  const [savedAt, setSavedAt] = useState<{ at: Date; automatic: boolean }>();
  const dirty = !sameDraft(asStored(draft), saved);
  const times = useMemo(() => new Intl.DateTimeFormat(language, { timeStyle: "short" }), [language]);

  const save = useMutation({
    mutationFn: ({ value }: { value: SaveEntryBody; automatic: boolean }) => api.saveEntry(entry.id, value),
    // A save by hand is news; one the editor made by itself is not, and the
    // state beside the Save button already says when it happened. The one
    // conflict a save can meet here is an address another entry holds.
    onError: (error) =>
      error instanceof DashboardApiError && error.code === "conflict"
        ? notify({ tone: "danger", message: text("addressTaken") })
        : notifyError(error),
    onSuccess: (stored, { automatic }) => {
      if (!automatic) notify({ tone: "success", message: text("saved") });
      const now = draftOf(stored);
      setSaved(now);
      setSavedAt({ at: new Date(), automatic });
      queryClient.setQueryData(queryKeys.entryDetail(entry.id), stored);
      void queryClient.invalidateQueries({ queryKey: queryKeys.entryList(kind) });
      // The topics screen counts the entries of each topic.
      void queryClient.invalidateQueries({ queryKey: queryKeys.topics });
    },
  });

  // A draft saves itself once typing pauses. Only when both what is stored and
  // what is being written are drafts, so choosing "public" is never saved by
  // waiting.
  // An address still being typed, such as one ending in a hyphen, is not saved
  // by any of the ways a save starts, and neither is a specification pair still
  // missing its label or its value.
  const writable = !entry.trashed && isSavableSlug(draft.slug) && entrySpecs.safeParse(draft.specs).success;
  const savable = writable && (draft.state === "draft" || publishable);
  const publishReady = writable && publishable;
  const autosaving =
    savable && saved.state === "draft" && draft.state === "draft" && dirty && !save.isPending;
  useEffect(() => {
    if (!autosaving) return;
    const timer = setTimeout(() => save.mutate({ value: draft, automatic: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autosaving, draft, save]);

  // Command-S does what the Save button does, and nothing while it is disabled.
  useSaveShortcut(() => {
    if (savable && dirty && !save.isPending) save.mutate({ value: draft, automatic: false });
  });

  // Closing the tab or reloading with something unsaved asks the browser's own question.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Leaving inside the dashboard asks the dashboard's own question, except for
  // an entry in the trash, which cannot be saved, and after moving it there,
  // which was asked about already.
  const trashedHere = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !entry.trashed && !trashedHere.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const [askingToTrash, setAskingToTrash] = useState(false);
  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.entryList(kind) });
    void refreshCounts(queryClient);
  };
  const trash = useMutation({
    mutationFn: () => api.setTrashed(entry.id, true),
    onSuccess: () => {
      trashedHere.current = true;
      refreshLists();
      void queryClient.invalidateQueries({ queryKey: queryKeys.everyEntryDetail });
      notify({ tone: "success", message: text("trashedNotice") });
      navigate(`/${area.path}`);
    },
  });
  const restore = useMutation({
    mutationFn: () => api.setTrashed(entry.id, false),
    onError: (error) => notifyError(error),
    onSuccess: (stored) => {
      queryClient.setQueryData(queryKeys.entryDetail(entry.id), stored);
      refreshLists();
      notify({ tone: "success", message: text("restored") });
    },
  });

  // The other language is created as a draft and opened at once, because that
  // is where its writing happens. Leaving with unsaved changes still asks first.
  const translate = useMutation({
    mutationFn: () => api.createTranslation(entry.id),
    onError: (error) => notifyError(error),
    onSuccess: (created) => {
      notify({
        tone: "success",
        message: text("translationCreated", text(LANGUAGE_TEXT[otherLanguage(entry.language)])),
      });
      queryClient.setQueryData(queryKeys.entryDetail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: queryKeys.entryDetail(entry.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entryList(kind) });
      navigate(`/${area.path}/${created.id}`);
    },
  });

  // The preview shows what the editor holds, saved or not. The window opens on
  // the click itself, because Safari blocks one opened after a request returns,
  // and is sent to the preview's address once the API has made it. It is cut
  // loose from this page, so the preview cannot reach back into the dashboard.
  const preview = useMutation({
    mutationFn: ({ value }: { value: SaveEntryBody; target: Window | null }) =>
      api.createPreview(entry.id, {
        title: value.title,
        summary: value.summary,
        body: value.body,
        readingWidth: value.readingWidth,
      }),
    onSuccess: ({ url }, { target }) => {
      if (target) {
        target.opener = null;
        target.location.href = url;
      } else {
        window.open(url, "_blank", "noopener");
      }
    },
    onError: (error, { target }) => {
      target?.close();
      notifyError(error);
    },
  });
  const openPreview = () => preview.mutate({ value: draft, target: window.open("", "_blank") });

  const update = (change: Partial<SaveEntryBody>) => setDraft((current) => ({ ...current, ...change }));

  const status = save.isPending
    ? text("savePending")
    : dirty
      ? text("unsavedChanges")
      : savedAt
        ? text(savedAt.automatic ? "autosavedAt" : "savedAt", times.format(savedAt.at))
        : "";

  return (
    <>
      {/* The entry's title stands in the bar, after the way back, so the
          writing column starts with what is written. */}
      <BackToList area={area}>
        <h1 className="app-bar-title">{draft.title.trim() || text("editorTitleMissing")}</h1>
      </BackToList>
      {/* What the entry's state is and what can be done with it, at the end of
          the bar, where they stay in view however far the text is scrolled. */}
      {entry.trashed ? (
        // In the trash nothing is written or published; the one thing to do is
        // to take it out again.
        <HeaderEnd>
          <span className="badge" data-status="trashed" role="status">
            {text("editorInTrash")}
          </span>
          <Button
            tone="primary"
            icon={<ArrowCounterClockwiseIcon />}
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
          >
            {restore.isPending ? text("restorePending") : text("restore")}
          </Button>
        </HeaderEnd>
      ) : (
        <HeaderEnd>
          <span className="entry-editor__status" role="status" data-unsaved={dirty ? "" : undefined}>
            {status}
          </span>
          <Button
            tone={saved.state === "public" && draft.state === "public" ? "primary" : "secondary"}
            disabled={!savable || !dirty || save.isPending}
            icon={<FloppyDiskIcon />}
            onClick={() => save.mutate({ value: draft, automatic: false })}
          >
            {text("save")}
          </Button>
          {!(saved.state === "public" && draft.state === "public") && (
            <Button
              tone="primary"
              disabled={!publishReady || save.isPending}
              aria-describedby="content-publish-reason"
              icon={<GlobeIcon />}
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
        </HeaderEnd>
      )}
      <Editor>
        <WritingSurface
          title={draft.title}
          body={draft.body}
          language={entry.language}
          focusTitle={focusTitle}
          editor={editor}
          textSize={textSize}
          setTextSize={setTextSize}
          onTitle={(title) => update({ title })}
          onBody={(body) => update({ body })}
          onValidation={setChecked}
        />
        <EntryProperties
          entry={entry}
          draft={draft}
          checked={checked}
          area={area}
          update={update}
          previewPending={preview.isPending}
          openPreview={openPreview}
          translationPending={translate.isPending}
          onTranslate={() => translate.mutate()}
          onTrash={() => setAskingToTrash(true)}
          onSelectFinding={(finding) => editor.current?.selectFinding(finding)}
        />
      </Editor>
      {askingToTrash && (
        <TrashDialog
          entry={entry}
          title={draft.title.trim() || text("editorTitleMissing")}
          pending={trash.isPending}
          error={trash.error}
          onConfirm={() => trash.mutate()}
          onClose={() => setAskingToTrash(false)}
        />
      )}
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

/**
 * The question before a translation goes to the trash: what that does on the
 * site, what happens to the other language, how many files it releases once the
 * trash is emptied, and whether navigation points at it.
 *
 * The figures are asked for when the dialog opens, so they describe the entry
 * as it is stored at that moment.
 */
function TrashDialog({
  entry,
  title,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  entry: EntryDetail;
  title: string;
  pending: boolean;
  /** Why the last attempt to move it failed, or null. */
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const impact = useQuery({
    queryKey: queryKeys.trashImpact(entry.id),
    queryFn: () => api.fetchTrashImpact(entry.id),
  });
  return (
    <ConfirmDialog
      title={text("trashTitle", title)}
      confirm={pending ? text("trashPending") : text("trash")}
      busy={pending}
      blocked={!impact.data}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p>{text("trashBody")}</p>
      {entry.counterpart && (
        <p>{text("trashOtherLanguage", text(LANGUAGE_TEXT[entry.counterpart.language]))}</p>
      )}
      {impact.isError && <ErrorNotice error={impact.error} />}
      {impact.data && <p>{text("trashMedia", impact.data.mediaReferences)}</p>}
      {impact.data && impact.data.navigationItems > 0 && (
        <p>{text("trashNavigation", impact.data.navigationItems)}</p>
      )}
    </ConfirmDialog>
  );
}
