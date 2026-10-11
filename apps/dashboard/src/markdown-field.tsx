import type { ContentProfile } from "@layered/content";
import { Editor, Field } from "@layered/ui";
import { lazy, type ReactNode, Suspense } from "react";
import type { KnownValue } from "./content-completion.js";
import { useDashboardLanguage } from "./language-context.js";

const ContentEditor = lazy(() =>
  import("./content-editor.js").then((module) => ({ default: module.ContentEditor })),
);

/** Props for a text that is written in the Markdown editor. */
export interface MarkdownFieldProps {
  /** The field's id, which its label points at. */
  id: string;
  /** The label, which also names the editor to assistive technology. */
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** What the editor shows while it is empty. */
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** The language the text is written in. */
  lang?: string;
  /** The part of the content language the text may be written in. */
  profile: ContentProfile;
  /**
   * What completes after `{{` and what the validator accepts there: the named
   * values for the whole language, a template's placeholders for a mail.
   */
  values?: readonly KnownValue[];
}

/**
 * A text longer than a line, written in the dashboard's Markdown editor
 * rather than in a plain text area.
 *
 * The editor stands in the field where a text area would, on the writing
 * surface's own face but at the height its text needs, so the same editor
 * that writes an entry writes a caption or a notice. It is loaded on demand,
 * as the entry editor's is, and a field whose language or lock changes gets a
 * new editor, because the editor reads those once.
 */
export function MarkdownField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
  lang,
  profile,
  values,
}: MarkdownFieldProps) {
  const { text } = useDashboardLanguage();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Editor.Surface id={id} className="editor__surface--field">
        <Suspense fallback={<p>{text("loading")}</p>}>
          <ContentEditor
            key={`${lang ?? ""}:${disabled ? "locked" : "open"}`}
            value={value}
            onChange={onChange}
            label={label}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            lang={lang}
            profile={profile}
            values={values}
          />
        </Suspense>
      </Editor.Surface>
    </Field>
  );
}
