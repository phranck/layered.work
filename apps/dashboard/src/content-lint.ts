import { type Diagnostic, linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { type Finding, validateContent } from "@layered/content";
import type { CheckedContent } from "./content-validation.js";
export const CONTENT_VALIDATION_DELAY = 250;
/**
 * One shared validator, after typing pauses; offsets belong to the exact reported source.
 *
 * @param report - Receives the source and what was found in it.
 * @param message - The sentence a finding is shown with.
 * @param valueNames - The names of the named values, or undefined while they are unknown.
 */
export function contentValidation(
  report: (checked: CheckedContent) => void,
  message: (finding: Finding) => string,
  valueNames: () => ReadonlySet<string> | undefined = () => undefined,
): Extension {
  return linter(
    (view) => {
      const source = view.state.doc.toString();
      // Until the values have loaded, references are taken on trust, as the
      // validator takes them without names; the API checks them again on publish.
      const validation = validateContent(source, { values: valueNames() });
      report({ source, validation });
      return validation.findings.map(
        (finding): Diagnostic => ({
          from: finding.from,
          to: finding.to,
          severity: finding.severity,
          message: message(finding),
        }),
      );
    },
    { delay: CONTENT_VALIDATION_DELAY },
  );
}
