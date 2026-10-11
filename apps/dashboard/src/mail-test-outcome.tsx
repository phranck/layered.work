import type { TestMailResult } from "@layered/schemas";
import { FieldHint } from "@layered/ui";
import { useDashboardLanguage } from "./language-context.js";

/**
 * What became of a test message: whether SMTP2GO took it, for which address,
 * and its answer quoted as it came. The mail settings and the template editor
 * both send one, and both say the outcome with this.
 *
 * Accepted reads as success and anything else as a problem, in the status
 * tones, and the whole block is read out as it arrives.
 *
 * @param result - What the API reported.
 */
export function MailTestOutcome({ result }: { result: TestMailResult }) {
  const { text } = useDashboardLanguage();
  return (
    <div className="mail-test-outcome" role="status" data-tone={result.accepted ? "success" : "danger"}>
      <p>
        {result.accepted
          ? text("testMailAccepted", result.recipient)
          : text("testMailRefused", result.recipient)}
      </p>
      <FieldHint as="p">
        {text("testMailAnswer")}: <q>{result.answer}</q>
      </FieldHint>
    </div>
  );
}
