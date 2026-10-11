import type { ContentLanguage } from "@layered/schemas";
import { MaxLength } from "@layered/schemas";
import { Editor, Field, Input } from "@layered/ui";
import {
  CodeIcon,
  LinkIcon,
  ListBulletsIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  QuotesIcon,
  TextBIcon,
  TextHTwoIcon,
  TextIndentIcon,
  TextItalicIcon,
} from "@layered/ui/icons";
import { lazy, type ReactNode, type RefObject, Suspense } from "react";
import type { ContentEditorHandle } from "./content-editor.js";
import type { CheckedContent } from "./content-validation.js";
import { type EditorTextSize, steppedTextSize } from "./editor-text-size.js";
import { COMPONENT_GROUPS, COMPONENT_ICONS, componentSnippet } from "./editor-toolbar.js";
import { useDashboardLanguage } from "./language-context.js";
import { useMediaLibrary } from "./media-query.js";
import { MediaUploadProgress } from "./media-uploads.js";
import { useNamedValues } from "./named-values-query.js";

const ContentEditor = lazy(() =>
  import("./content-editor.js").then((module) => ({ default: module.ContentEditor })),
);
/**
 * The editor's main column: the title, the toolbar, the writing surface and
 * the actions under the text. The text is written in CodeMirror, loaded when
 * the surface first shows, and the toolbar acts on it through `editor`.
 *
 * @param title - The entry's title as drafted.
 * @param body - The entry's text as drafted.
 * @param language - The entry's language, which the title field is marked with.
 * @param focusTitle - Whether the title takes the focus when the editor opens, for a new entry.
 * @param editor - The handle the toolbar inserts into the text through.
 * @param textSize - The size the text is written at.
 * @param setTextSize - Changes that size.
 * @param onTitle - Replaces the title.
 * @param onBody - Replaces the text.
 * @param onValidation - Receives the validator's findings for the text.
 */

export function WritingSurface({
  title,
  body,
  language,
  focusTitle,
  editor,
  textSize,
  setTextSize,
  onTitle,
  onBody,
  onValidation,
  actions,
}: {
  title: string;
  body: string;
  language: ContentLanguage;
  focusTitle: boolean;
  editor: RefObject<ContentEditorHandle | null>;
  textSize: EditorTextSize;
  setTextSize: (size: EditorTextSize) => void;
  onTitle: (title: string) => void;
  onBody: (body: string) => void;
  onValidation: (checked: CheckedContent) => void;
  /** The actions under the text, such as its preview and its move to the trash. */
  actions?: ReactNode;
}) {
  const { text } = useDashboardLanguage();
  const { library, progress } = useMediaLibrary();
  const values = useNamedValues();
  return (
    <Editor.Main>
      {/* The label beside its field rather than over it, so the title takes
              one line and the text starts higher. */}
      <Field.Inline className="entry-editor__title" label={text("editorTitle")} htmlFor="entry-title">
        <Input
          id="entry-title"
          autoFocus={focusTitle}
          value={title}
          maxLength={MaxLength.Line}
          lang={language}
          onChange={(event) => onTitle(event.target.value)}
        />
      </Field.Inline>
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
          [
            <Editor.Tool
              key="reindent"
              label={text("toolReindent")}
              icon={<TextIndentIcon />}
              onClick={() => editor.current?.reindent()}
            />,
          ],
          // The size the text is written at, last, apart from the tools
          // that change the text itself.
          [
            <Editor.Tool
              key="text-smaller"
              label={text("editorTextSmaller")}
              icon={<MagnifyingGlassMinusIcon />}
              disabled={steppedTextSize(textSize, -1) === textSize}
              onClick={() => setTextSize(steppedTextSize(textSize, -1))}
            />,
            <Editor.Tool
              key="text-larger"
              label={text("editorTextLarger")}
              icon={<MagnifyingGlassPlusIcon />}
              disabled={steppedTextSize(textSize, 1) === textSize}
              onClick={() => setTextSize(steppedTextSize(textSize, 1))}
            />,
          ],
        ]}
      />
      {/* Files dropped or pasted onto the text, while they upload, and any that
          failed with the reason, until the next upload. */}
      {progress.length > 0 && <MediaUploadProgress items={progress} />}
      <Editor.Surface data-text-size={textSize}>
        <Suspense fallback={<p className="unfinished">{text("loading")}</p>}>
          <ContentEditor
            editorRef={editor}
            library={library}
            values={values.data}
            value={body}
            label={text("editorText")}
            onChange={(body) => onBody(body)}
            onValidation={onValidation}
          />
        </Suspense>
      </Editor.Surface>
      {actions}
    </Editor.Main>
  );
}
