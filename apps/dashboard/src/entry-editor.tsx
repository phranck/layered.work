import { validateContent } from "@layered/content";
import type { EntryDetail, SaveEntryBody } from "@layered/schemas";
import { Button, Card, Editor, Section } from "@layered/ui";
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  FloppyDiskIcon,
  GlobeIcon,
  XIcon,
} from "@layered/ui/icons";
import { useEffect, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate, useParams } from "react-router";
import { DashboardApiError } from "./api.js";
import { BackToList, HeaderEnd } from "./app-bar-slots.js";
import type { ContentEditorHandle } from "./content-editor.js";
import { type CheckedContent, contentIsPublishable } from "./content-validation.js";
import { useEditorTextSize } from "./editor-text-size.js";
import {
  AUTOSAVE_DELAY_MS,
  asStored,
  draftAbilities,
  draftOf,
  sameDraft,
  savesItself,
} from "./entry-draft.js";
import { LANGUAGE_TEXT, otherLanguage } from "./entry-model.js";
import { EntryProperties } from "./entry-properties.js";
import {
  useCreateTranslation,
  useEntry,
  useEntryPreview,
  useRestoreEntry,
  useSaveEntry,
  useTrashEntry,
  useTrashImpact,
} from "./entry-query.js";
import { WritingSurface } from "./entry-writing.js";
import { ErrorNotice } from "./error-notice.js";
import { TIME_FORMAT } from "./format.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog, ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
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

/**
 * The entry an address names, once it has loaded.
 *
 * @param area - The list this entry belongs to, for the way back.
 */
export function EntryEditorScreen({ area }: { area: DashboardArea }) {
  const { id = "" } = useParams();
  const location = useLocation();
  const { text } = useDashboardLanguage();
  const entry = useEntry(id);
  if (entry.isError) {
    return (
      <Section>
        <BackToList area={area} />
        <ErrorNotice error={entry.error} />
      </Section>
    );
  }
  if (!entry.data) return <BackToList area={area} title={text("loading")} />;
  // Keyed by the translation, so opening another one starts a fresh draft.
  return (
    <EntryEditor
      key={entry.data.id}
      area={area}
      entry={entry.data}
      focusTitle={location.state?.focusTitle === true}
    />
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
  entry,
  focusTitle = false,
}: {
  area: DashboardArea;
  entry: EntryDetail;
  focusTitle?: boolean;
}) {
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

  const save = useSaveEntry(entry, {
    // A save by hand is news; one the editor made by itself is not, and the
    // state beside the Save button already says when it happened. The one
    // conflict a save can meet here is an address another entry holds.
    onError: (error) =>
      error instanceof DashboardApiError && error.code === "conflict"
        ? notify({ tone: "danger", message: text("addressTaken") })
        : notifyError(error),
    onSuccess: (stored, { automatic }) => {
      if (!automatic) notify({ tone: "success", message: text("saved") });
      setSaved(draftOf(stored));
      setSavedAt({ at: new Date(), automatic });
    },
  });

  const { savable, publishReady } = draftAbilities(entry, draft, publishable);
  const autosaving = savesItself(saved, draft, savable, dirty) && !save.isPending;
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
  const trash = useTrashEntry(entry.id, {
    onSuccess: () => {
      trashedHere.current = true;
      notify({ tone: "success", message: text("trashedNotice") });
      navigate(`/${area.path}`);
    },
  });
  const restore = useRestoreEntry({
    onError: notifyError,
    onSuccess: () => notify({ tone: "success", message: text("restored") }),
  });

  // The other language is created as a draft and opened at once, because that
  // is where its writing happens. Leaving with unsaved changes still asks first.
  const translate = useCreateTranslation(entry, {
    onError: notifyError,
    onSuccess: (created) => {
      notify({
        tone: "success",
        message: text("translationCreated", text(LANGUAGE_TEXT[otherLanguage(entry.language)])),
      });
      navigate(`/${area.path}/${created.id}`);
    },
  });

  const preview = useEntryPreview(entry, { onError: notifyError });
  const openPreview = () => preview.mutate({ value: draft, target: window.open("", "_blank") });

  const update = (change: Partial<SaveEntryBody>) => setDraft((current) => ({ ...current, ...change }));

  const status = save.isPending
    ? text("savePending")
    : dirty
      ? text("unsavedChanges")
      : savedAt
        ? text(savedAt.automatic ? "autosavedAt" : "savedAt", TIME_FORMAT[language].format(savedAt.at))
        : "";

  return (
    <>
      {/* The entry's title stands in the bar, after the way back, so the
          writing column starts with what is written. */}
      <BackToList area={area} title={draft.title.trim() || text("editorTitleMissing")} />
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
            onClick={() => restore.mutate(entry.id)}
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
  const { text } = useDashboardLanguage();
  const impact = useTrashImpact(entry.id);
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
