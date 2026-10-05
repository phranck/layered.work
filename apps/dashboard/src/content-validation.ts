import type { Finding, FindingCode, Validation } from "@layered/content";
export type CheckedContent = { source: string; validation: Validation };
/** Stale diagnostics never authorize a publication after the next edit. */
export function contentIsPublishable(source: string, checked: CheckedContent): boolean {
  return source === checked.source && checked.validation.publishable;
}

const germanReasons: Record<FindingCode, string> = {
  "unknown-component": "ist keine Komponente",
  "deprecated-component": "verwendet einen veralteten Namen",
  "unknown-parameter": "hat diesen Parameter nicht",
  "duplicate-parameter": "hat einen doppelt angegebenen Parameter",
  "unnamed-not-accepted": "akzeptiert diesen Wert ohne Parameternamen nicht",
  "missing-parameter": "braucht einen fehlenden Parameter",
  "value-not-permitted": "hat einen ungültigen Parameterwert",
  "unknown-media": "verweist auf eine unbekannte Mediendatei",
  "body-not-accepted": "akzeptiert keinen Inhalt",
  "missing-body": "braucht Inhalt",
  "misplaced-component": "steht an einer nicht erlaubten Stelle",
  "content-not-accepted": "akzeptiert diesen Inhalt nicht",
  "unknown-field": "verweist auf ein unbekanntes Tabellenfeld",
  "missing-field": "braucht ein fehlendes Tabellenfeld",
  unclosed: "ist nicht geschlossen",
  "unexpected-character": "steht nicht allein auf seiner Zeile",
  unreadable: "konnte nicht gelesen werden",
};
export function findingMessage(finding: Finding, language: "en" | "de"): string {
  if (language === "en") return finding.message;
  const subject = finding.component ?? "Der Inhalt";
  return `${subject} ${germanReasons[finding.code]}${finding.parameter ? ` (${finding.parameter})` : ""}.${finding.suggestion ? ` Vorschlag: ${finding.suggestion}.` : ""}`;
}
