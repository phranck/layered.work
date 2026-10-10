import type { EntryKind, SearchResults } from "@layered/schemas";
import { Card, isApplePlatform, Row, RowList, Shortcut } from "@layered/ui";
import { ArticleIcon, ImagesIcon, MagnifyingGlassIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
import { queryKeys } from "./query-keys.js";
import { entryPath } from "./routes.js";

/**
 * Search, on the same shortcut everywhere.
 *
 * Command-K on an Apple platform and Control-K elsewhere takes the reader to the
 * search for the screen they are on. A screen with a list registers its own
 * search field, and the shortcut focuses it. A screen without one has nothing
 * to focus, so the shortcut opens a dialog that searches entries and media.
 *
 * The shortcut leaves a text field alone, because Command-K in a text field may
 * be the reader's own keystroke. The one exception is a search field, where the
 * shortcut simply puts the caret back.
 */

/** How long typing has to pause before the dialog asks the API, in milliseconds. */
const SEARCH_DELAY_MS = 150;

/** Input types that take no typed text, where the shortcut is free to act. */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * Whether a key event is the search shortcut on this platform.
 *
 * @param event - The keystroke.
 * @param apple - Whether the modifier is Command rather than Control.
 */
export function isSearchShortcut(event: ShortcutEvent, apple: boolean): boolean {
  return isModifierShortcut(event, "k", apple);
}

/** What a shortcut is read from. */
export type ShortcutEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/**
 * Whether a key event is the platform's modifier with one letter and nothing
 * else: Command on an Apple platform, Control elsewhere.
 *
 * @param event - The keystroke.
 * @param letter - The letter, in lower case.
 * @param apple - Whether the modifier is Command rather than Control.
 */
export function isModifierShortcut(event: ShortcutEvent, letter: string, apple: boolean): boolean {
  const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === letter;
}

/**
 * Whether an element takes typed text, so a shortcut must not take its keys.
 *
 * @param element - Whatever has focus.
 */
export function takesText(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(element.type);
}

/** What a screen and the shortcut share. */
interface SearchContextValue {
  /** Registers the current screen's search field, or clears it with null. */
  registerField: (field: HTMLInputElement | null) => void;
  /** Hands focus back to where it was before the shortcut moved it to the field. */
  returnFocus: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * Listens for the shortcut for everything inside it, and holds the dialog.
 *
 * @param children - The dashboard's frame.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const field = useRef<HTMLInputElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const apple = isApplePlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event, apple)) return;
      const active = document.activeElement;
      const inSearch = active instanceof HTMLElement && active.hasAttribute("data-search-field");
      if (takesText(active) && !inSearch) return;
      event.preventDefault();
      const target = field.current;
      if (!target) {
        setDialogOpen(true);
        return;
      }
      if (active !== target) returnTo.current = active instanceof HTMLElement ? active : null;
      target.focus();
      target.select();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const registerField = useCallback((element: HTMLInputElement | null) => {
    field.current = element;
  }, []);

  const returnFocus = useCallback(() => {
    const target = returnTo.current;
    returnTo.current = null;
    if (target?.isConnected) target.focus();
    else field.current?.blur();
  }, []);

  const value = useMemo(() => ({ registerField, returnFocus }), [registerField, returnFocus]);
  return (
    <SearchContext value={value}>
      {children}
      {dialogOpen && <SearchDialog onClose={() => setDialogOpen(false)} />}
    </SearchContext>
  );
}

/**
 * What a screen with a search field of its own needs.
 *
 * @returns A ref callback for the field, which registers it with the shortcut
 *   for as long as it is on screen, and `returnFocus` for its Escape key.
 */
export function useSearchField() {
  const context = use(SearchContext);
  const register = context?.registerField;
  const fieldRef = useCallback((element: HTMLInputElement | null) => register?.(element), [register]);
  return { fieldRef, returnFocus: context?.returnFocus ?? (() => {}) };
}

/**
 * The key cap for the search shortcut, naming the modifier this platform uses
 * in the interface language: a German keyboard labels Control "Strg".
 */
export function SearchShortcutCap() {
  const { text } = useDashboardLanguage();
  const apple = isApplePlatform();
  return (
    <Shortcut shortcutKey="K" platform={apple ? "apple" : "control"} aria-hidden="true">
      {apple ? "⌘K" : `${text("controlKey")} K`}
    </Shortcut>
  );
}

/** The catalogue word for each kind of entry, as a hit's note. */
const KIND_TEXT: Record<EntryKind, DashboardStringKey> = {
  post: "kindPost",
  page: "kindPage",
  project: "kindProject",
};

/** One hit, whichever kind it is, flattened so the arrow keys can move across both kinds. */
interface Hit {
  key: string;
  path: string;
  title: string;
  note: string;
  thumbnailUrl: string | null;
  language?: string;
  group: "entries" | "media";
}

function hitsOf(results: SearchResults | undefined, kindText: (kind: EntryKind) => string): Hit[] {
  if (!results) return [];
  return [
    ...results.entries.map((hit) => ({
      key: `entry-${hit.id}`,
      path: entryPath(hit.kind, hit.id),
      title: hit.title,
      note: kindText(hit.kind),
      thumbnailUrl: null,
      language: hit.language,
      group: "entries" as const,
    })),
    ...results.media.map((hit) => ({
      key: `media-${hit.id}`,
      // The library opens on its own screen; the media browser is where a file
      // will open by itself.
      path: "/media",
      title: hit.slug,
      note: hit.altText ?? "",
      thumbnailUrl: hit.thumbnailUrl,
      group: "media" as const,
    })),
  ];
}

/** The value it was given, once it has stopped changing for the delay. */
function useSettled<Value>(value: Value, delay: number): Value {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * The search for a screen without a list: a field, and what it finds in
 * entries and in the media library.
 *
 * The field keeps the focus throughout. The arrow keys move the active hit and
 * Enter opens it, which is what `aria-activedescendant` tells a screen reader.
 * Escape closes the dialog and focus goes back to where it was.
 *
 * @param onClose - Closes the dialog.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const { text } = useDashboardLanguage();
  const [query, setQuery] = useState("");
  const settled = useSettled(query.trim(), SEARCH_DELAY_MS);
  const [active, setActive] = useState(0);
  const results = useQuery({
    queryKey: queryKeys.search(settled),
    queryFn: () => api.search(settled),
    enabled: settled.length > 0,
  });
  const hits = settled ? hitsOf(results.data, (kind) => text(KIND_TEXT[kind])) : [];
  const activeHit = hits[Math.min(active, hits.length - 1)];
  const activeKey = activeHit?.key;

  // The list scrolls inside the dialog, so a hit reached with the arrow keys is
  // brought into view rather than left below the edge.
  useEffect(() => {
    if (activeKey) document.getElementById(activeKey)?.scrollIntoView?.({ block: "nearest" });
  }, [activeKey]);

  const open = (hit: Hit) => {
    onClose();
    navigate(hit.path);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (hits.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (Math.min(current, hits.length - 1) + step + hits.length) % hits.length);
    } else if (event.key === "Enter" && activeHit) {
      event.preventDefault();
      open(activeHit);
    }
  };

  const group = (name: Hit["group"], label: string) => {
    const members = hits.filter((hit) => hit.group === name);
    if (members.length === 0) return null;
    return (
      // biome-ignore lint/a11y/useSemanticElements: An option group inside a listbox is a role, and fieldset would add browser layout.
      <div role="group" aria-label={label} className="search-results__group">
        <p className="search-results__label" aria-hidden="true">
          {label}
        </p>
        <RowList>
          {members.map((hit) => (
            <Row
              key={hit.key}
              id={hit.key}
              role="option"
              aria-selected={hit === activeHit}
              data-active={hit === activeHit ? "" : undefined}
              className="row--interactive"
              onClick={() => open(hit)}
              onMouseMove={() => setActive(hits.indexOf(hit))}
            >
              <Row.Tile aria-hidden="true">
                {hit.thumbnailUrl ? (
                  <img src={hit.thumbnailUrl} alt="" loading="lazy" />
                ) : name === "entries" ? (
                  <ArticleIcon weight="duotone" />
                ) : (
                  <ImagesIcon weight="duotone" />
                )}
              </Row.Tile>
              <Row.Text title={hit.title} note={hit.note || undefined} />
              {hit.language && (
                <Row.Meta>
                  <span className="lang-tag" data-language={hit.language}>
                    {hit.language}
                  </span>
                </Row.Meta>
              )}
            </Row>
          ))}
        </RowList>
      </div>
    );
  };

  return (
    <CardDialog labelId="search-dialog-title" onClose={onClose}>
      <Card.Header id="search-dialog-title" title={text("search")} />
      <Card.Body className="search-dialog">
        <label className="search-field search-field--wide">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            className="input"
            type="search"
            role="combobox"
            aria-label={text("searchEverything")}
            aria-expanded={hits.length > 0}
            aria-controls="search-results"
            aria-activedescendant={activeHit?.key}
            aria-autocomplete="list"
            placeholder={text("searchEverything")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            data-search-field=""
            // biome-ignore lint/a11y/noAutofocus: The dialog exists to be typed into, and it was opened from the keyboard.
            autoFocus
          />
          <SearchShortcutCap />
        </label>
        {results.isError && <ErrorNotice error={results.error} />}
        <div id="search-results" role="listbox" aria-label={text("searchResults")} className="search-results">
          {group("entries", text("searchEntries"))}
          {group("media", text("media"))}
        </div>
        {!settled && <p className="unfinished">{text("searchHint")}</p>}
        {settled && results.isSuccess && hits.length === 0 && (
          <p className="unfinished">{text("searchNothing")}</p>
        )}
      </Card.Body>
    </CardDialog>
  );
}
