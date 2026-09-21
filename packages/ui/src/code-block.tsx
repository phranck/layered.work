import type { CodeNode } from "@layered/content";
import { CodeIcon } from "@phosphor-icons/react/dist/ssr/Code";
import { CopyIcon } from "@phosphor-icons/react/dist/ssr/Copy";
import { BrandMark, type BrandName } from "./brand-mark.js";
import { Button } from "./button.js";
import { highlightCode } from "./code-highlight.js";

/** Exact code source and the optional language from the shared render model. */
export type CodeBlockProps = Omit<CodeNode, "kind">;

/**
 * The brand mark standing for a language name in the toolbar.
 *
 * Keyed by the name an author writes on the fence, so the shell's three common
 * spellings all reach GNU Bash. A language absent here has no mark of its own
 * in Simple Icons, or none that means anything to a reader, and the block shows
 * the neutral code glyph instead. Adding one is the procedure in
 * `assets/ICON_NOTICES.md`.
 */
const LANGUAGE_BRANDS: Readonly<Record<string, BrandName>> = {
  swift: "swift",
  bash: "gnubash",
  sh: "gnubash",
  shell: "gnubash",
  zsh: "gnubash",
  html: "html5",
};

/** The complete line-number column, kept outside the source's scroll container. */
function CodeBlockGutter({ source }: Pick<CodeBlockProps, "source">) {
  const lines = Math.max(1, source.split("\n").length - Number(source.endsWith("\n")));
  return (
    <pre className="content-code__gutter" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => index + 1).join("\n")}
    </pre>
  );
}
/** Colored text spans keep the exact authored source available for selection and copying. */
function CodeBlockSource({ source, language }: CodeBlockProps) {
  return (
    <pre className="content-code__source">
      <code>
        {highlightCode(source, language).map((token) => (
          <span key={token.offset} style={{ color: token.color }}>
            {token.content}
          </span>
        ))}
      </code>
    </pre>
  );
}
/** Progressive copy action; the website enables it when the clipboard hook is installed. */
function CodeBlockCopy() {
  return (
    <Button.Icon
      className="content-code__copy"
      label="Copy code"
      data-copy-code=""
      disabled
      icon={<CopyIcon weight="duotone" />}
    />
  );
}
function CodeBlockRoot({ source, language }: CodeBlockProps) {
  const brand = language ? LANGUAGE_BRANDS[language.toLowerCase()] : undefined;
  return (
    <figure className="content-code" data-code-block="" data-language={language}>
      <figcaption className="content-code__toolbar">
        {brand ? (
          <BrandMark className="content-code__mark" brand={brand} />
        ) : (
          <CodeIcon className="content-code__mark" weight="duotone" aria-hidden="true" />
        )}
        <span>{language ?? "Code"}</span>
        <CodeBlockCopy />
      </figcaption>
      <div className="content-code__body">
        <CodeBlockGutter source={source} />
        <CodeBlockSource source={source} language={language} />
      </div>
    </figure>
  );
}
/** A code block with separate gutter, scrollable source and progressive copy compounds. */
export const CodeBlock = Object.assign(CodeBlockRoot, {
  Gutter: CodeBlockGutter,
  Source: CodeBlockSource,
  Copy: CodeBlockCopy,
});
