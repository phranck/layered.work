import type { Finding } from "@layered/content";
import { Button, Field, FieldHint } from "@layered/ui";
import { WarningIcon, WarningOctagonIcon } from "@layered/ui/icons";
import type { CheckedContent } from "./content-validation.js";
import { useDashboardLanguage } from "./language-context.js";
import "./content-validation.css";

/**
 * What the validator found in the body, as the first field of the editor's
 * panel: a sentence saying whether the entry can be published, and each finding
 * as a button that selects its place in the text.
 *
 * The sentence is what the Publish button is described by, so it says why the
 * button is disabled while an error stands. While the text has changed since
 * the last check, it says the check is running and lists nothing, so no finding
 * points at a place that has moved.
 *
 * @param checked - The last check and the text it was made on.
 * @param source - The body as it stands now.
 * @param onSelect - Selects a finding's place in the text.
 */
export function ContentFindings({
  checked,
  source,
  onSelect,
}: {
  checked: CheckedContent;
  source: string;
  onSelect: (finding: Finding) => void;
}) {
  const { text } = useDashboardLanguage();
  const current = source === checked.source;
  const errors = checked.validation.findings.filter((finding) => finding.severity === "error");
  return (
    <Field label={text("contentValidation")}>
      <FieldHint as="p" id="content-publish-reason" aria-live="polite">
        {!current
          ? text("contentChecking")
          : errors[0]
            ? text("contentPublishBlocked", text("contentFinding", errors[0]))
            : text("contentValid")}
      </FieldHint>
      {current && (
        <ul className="content-findings">
          {checked.validation.findings.map((finding) => (
            <li key={`${finding.from}-${finding.to}-${finding.code}`} data-severity={finding.severity}>
              <Button
                icon={finding.severity === "error" ? <WarningOctagonIcon /> : <WarningIcon />}
                onClick={() => onSelect(finding)}
              >
                <span>
                  {text(finding.severity === "error" ? "contentError" : "contentWarning")}:{" "}
                  {text("contentFinding", finding)}
                </span>
                <FieldHint>{text("contentPosition", finding.line, finding.column)}</FieldHint>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
