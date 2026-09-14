/**
 * What the validator reports, and how anything else reads it.
 *
 * **A finding carries a code as well as a sentence.** The code is the interface
 * and the sentence is English. The dashboard is German or English, so a German
 * message is built from the code and the names beside it rather than translated
 * from the English one. Everything else such a sentence needs is already in the
 * register, which is why a finding carries the component and the parameter it
 * is about and not the list of values that parameter accepts.
 *
 * **A position is given twice.** Offsets are what an editor underlines, and a
 * line and a column are what a person reads. Deriving one from the other needs
 * the document, which whoever shows the finding may no longer have.
 */

/** Whether something is refused or merely pointed out. */
export type Severity = "error" | "warning";

/**
 * What kind of thing was found.
 *
 * These are published: the editor branches on them and a translation is keyed
 * by them, so a value here is not renamed without both.
 */
export const FINDING = {
  /** A name that is no component, under any spelling the register knows. */
  UnknownComponent: "unknown-component",
  /** A name the register still answers to and would rather not. */
  DeprecatedComponent: "deprecated-component",
  /** A parameter this component does not have. */
  UnknownParameter: "unknown-parameter",
  /** The same parameter given twice, where the second would silently win. */
  DuplicateParameter: "duplicate-parameter",
  /** A value written first without a name, where none belongs. */
  UnnamedNotAccepted: "unnamed-not-accepted",
  /** A parameter the component cannot be written without. */
  MissingParameter: "missing-parameter",
  /** A value the parameter does not take, whatever the reason. */
  ValueNotPermitted: "value-not-permitted",
  /** A media name that nothing in the library answers to. */
  UnknownMedia: "unknown-media",
  /** A body on a component that holds nothing. */
  BodyNotAccepted: "body-not-accepted",
  /** No body on a component that exists to hold something. */
  MissingBody: "missing-body",
  /** A bracket or a brace that is never closed. */
  Unclosed: "unclosed",
  /** A component the parser marked and could not explain. */
  Unreadable: "unreadable",
} as const;

/** One of the codes above. */
export type FindingCode = (typeof FINDING)[keyof typeof FINDING];

/** Something the validator found, and where. */
export type Finding = {
  code: FindingCode;
  severity: Severity;
  /** English, plain, and safe to show anybody. */
  message: string;
  /** The first character it is about. */
  from: number;
  /** Just past the last character it is about. */
  to: number;
  /** Which line, counting from one. */
  line: number;
  /** Which character of that line, counting from one. */
  column: number;
  /** The component it is about, by the name the register knows it under. */
  component?: string;
  /** The parameter it is about. */
  parameter?: string;
  /** What was written, where what was written is the subject. */
  value?: string;
  /** A name near enough to what was written to be worth offering instead. */
  suggestion?: string;
};

/** What a document turned out to be. */
export type Validation = {
  /** Everything found, in the order it appears in the document. */
  findings: Finding[];
  /**
   * Whether this may be published.
   *
   * False as soon as one finding is an error. A warning does not stop
   * publishing: a deprecated name still renders, which is the entire reason for
   * keeping it.
   */
  publishable: boolean;
};
