import type { Finding } from "@layered/content";
import { Button, Field } from "@layered/ui";
import type { CheckedContent } from "./content-validation.js";
import { useDashboardLanguage } from "./language-context.js";
import "./content-validation.css";
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
      <p className="entry-editor__note" id="content-publish-reason" aria-live="polite">
        {!current
          ? text("contentChecking")
          : errors[0]
            ? text("contentPublishBlocked", text("contentFinding", errors[0]))
            : text("contentValid")}
      </p>
      {current && (
        <ul className="content-findings">
          {checked.validation.findings.map((finding) => (
            <li key={`${finding.from}-${finding.to}-${finding.code}`} data-severity={finding.severity}>
              <Button onClick={() => onSelect(finding)}>
                <span>
                  {text(finding.severity === "error" ? "contentError" : "contentWarning")}:{" "}
                  {text("contentFinding", finding)}
                </span>
                <small>{text("contentPosition", finding.line, finding.column)}</small>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
