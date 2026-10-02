import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { commonmarkLanguage, markdown } from "@codemirror/lang-markdown";
import type { LanguageSupport } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { CONTENT_SYNTAX } from "@layered/content";
import { useEffect, useEffectEvent, useRef } from "react";

/**
 * The writing surface for an entry's body.
 *
 * CodeMirror 6, parsing with the content language's own Lezer extension, so
 * what the author types is parsed into exactly the tree the server parses.
 * Highlighting, completion and validation build on that tree in their own
 * steps; this is the surface they attach to.
 */

/**
 * The content language as CodeMirror takes it.
 *
 * CommonMark as the base, extended by the same list the server's parser is
 * configured from. `@codemirror/lang-markdown` would otherwise default to its
 * own Markdown, which adds subscript, superscript and emoji, and its tree would
 * then differ from the server's on exactly those characters. HTML tag
 * completion is off, because the content language is written with components
 * rather than markup.
 */
export function contentLanguage(): LanguageSupport {
  return markdown({ base: commonmarkLanguage, extensions: CONTENT_SYNTAX, completeHTMLTags: false });
}

/**
 * How the surface looks, which is mostly that it looks like nothing of its own.
 *
 * The face, its ligatures, the code size, the line height, the surface and the
 * edge all come from `.editor__surface` in the shared UI package, so the editor
 * inherits them rather than stating them a second time. The caret takes the
 * accent, and the browser's focus outline is replaced by the surface's own
 * focus, which the stylesheet draws.
 */
const surfaceTheme = EditorView.theme(
  {
    "&": { color: "inherit", backgroundColor: "transparent", fontSize: "inherit" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "visible" },
    ".cm-content": { padding: "0", caretColor: "var(--text-accent)" },
    ".cm-line": { padding: "0" },
    ".cm-cursor": { borderLeftColor: "var(--text-accent)" },
  },
  { dark: true },
);

/**
 * Everything the surface does, in one list.
 *
 * Prose is most of what is written here, so lines wrap. The standard keymap
 * brings undo and redo, find and replace, and several cursors: a further
 * cursor is added with Alt and a click, or Mod-D on the next match.
 *
 * @param label - What the surface is called to assistive technology.
 */
function surfaceExtensions(label: string): Extension[] {
  return [
    contentLanguage(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", spellcheck: "true" }),
    surfaceTheme,
  ];
}

/** Props for the writing surface. */
export interface ContentEditorProps {
  /** The body, as plain text. */
  value: string;
  /** Called with the whole body, as plain text, after every change the author makes. */
  onChange: (value: string) => void;
  /** What the surface is called to assistive technology. */
  label: string;
}

/**
 * A CodeMirror surface for one body.
 *
 * Plain text in and plain text out: the editor holds no state the document
 * does not carry, so saving the text and opening it again gives back the same
 * editor. A `value` that changes from outside, such as a reloaded entry,
 * replaces the document; a `value` that is only the echo of the author's own
 * typing is recognised and left alone, so the cursor does not jump.
 */
export function ContentEditor({ value, onChange, label }: ContentEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useEffectEvent((text: string) => onChange(text));
  const initialValue = useRef(value);
  const initialLabel = useRef(label);

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          surfaceExtensions(initialLabel.current),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="content-editor" />;
}
