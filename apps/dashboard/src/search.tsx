import { Card, isApplePlatform, Row, RowList, Shortcut } from "@layered/ui";
import { ArticleIcon, ImagesIcon, MagnifyingGlassIcon } from "@layered/ui/icons";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  type Ref,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useListbox } from "./listbox.js";
import { CardDialog } from "./modal.js";
import { ENTRY_KIND_TEXT, type Hit, hitsOf, useSearchResults } from "./search-query.js";
import { isSearchShortcut, takesText } from "./shortcuts.js";

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
    <Shortcut
      shortcutKey="K"
      platform={apple ? "apple" : "control"}
      controlLabel={text("controlKey")}
      aria-hidden="true"
    />
  );
}

/** Props for a search field. */
export interface SearchFieldProps
  extends Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "className"> {
  /** What the field searches, which is its accessible name and its placeholder. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The ref of the input itself, such as the one that registers it with the shortcut. */
  inputRef?: Ref<HTMLInputElement>;
  /** Whether the key cap of the search shortcut stands at its end, for the field the shortcut focuses. */
  shortcut?: boolean;
  /** Whether it takes the width it stands in, as the search dialog's field does, rather than a header's corner. */
  wide?: boolean;
}

/**
 * The dashboard's one search field: the magnifier, the field, and the key cap
 * of the search shortcut where the shortcut reaches it, on one surface. Every
 * search in the dashboard is this field, whether it narrows a table, searches
 * the media library or Unsplash, or searches everything in the dialog.
 */
export function SearchField({
  label,
  value,
  onChange,
  inputRef,
  shortcut,
  wide,
  ...props
}: SearchFieldProps) {
  return (
    <label className="search-field" data-wide={wide || undefined}>
      <MagnifyingGlassIcon aria-hidden="true" />
      <input
        ref={inputRef}
        className="input"
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-search-field={shortcut ? "" : undefined}
        {...props}
      />
      {shortcut && <SearchShortcutCap />}
    </label>
  );
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
  const navigate = useNavigate();
  const { text } = useDashboardLanguage();
  const [query, setQuery] = useState("");
  const { settled, results } = useSearchResults(query);
  const hits = settled ? hitsOf(results.data, (kind) => text(ENTRY_KIND_TEXT[kind])) : [];
  const open = (hit: Hit) => {
    onClose();
    navigate(hit.path);
  };
  const listbox = useListbox(hits, open);
  const activeKey = listbox.activeOption?.key;

  // The list scrolls inside the dialog, so a hit reached with the arrow keys is
  // brought into view rather than left below the edge.
  useEffect(() => {
    if (activeKey) document.getElementById(activeKey)?.scrollIntoView?.({ block: "nearest" });
  }, [activeKey]);

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
              className="row--interactive"
              onClick={() => open(hit)}
              {...listbox.optionProps(hits.indexOf(hit))}
            >
              <Row.Tile aria-hidden="true">
                {hit.thumbnailUrl ? (
                  <img src={hit.thumbnailUrl} alt="" loading="lazy" />
                ) : name === "entries" ? (
                  <ArticleIcon />
                ) : (
                  <ImagesIcon />
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
        <SearchField
          label={text("searchEverything")}
          value={query}
          onChange={(value) => {
            setQuery(value);
            listbox.reset();
          }}
          shortcut
          wide
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="search-results"
          aria-activedescendant={activeKey}
          aria-autocomplete="list"
          onKeyDown={(event) => {
            listbox.onKeyDown(event);
          }}
          // The dialog exists to be typed into, and it was opened from the keyboard.
          autoFocus
        />
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
