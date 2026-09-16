import type { SyntaxNode, Tree } from "@lezer/common";
import { nearestName } from "../nearest.js";
import { parseContent } from "../parser/index.js";
import { NODE } from "../parser/nodes.js";
import { argumentsOf, childOf, unquote, writtenKindOf, writtenValueOf } from "../parser/read.js";
import { scanComponent } from "../parser/scan.js";
import { SPACE_STEPS } from "../register/components.js";
import { accepts } from "../register/describe.js";
import type { ComponentDefinition, Parameter, Register } from "../register/kinds.js";
import { resolveComponent, unnamedParameter } from "../register/lookup.js";
import { FINDING, type Finding, type Validation } from "./findings.js";
import { placesIn } from "./position.js";

/**
 * Checking a document against the register.
 *
 * **One function, used in both places.** The editor runs it on the tree
 * CodeMirror already holds and shows what it finds as you type; the API runs it
 * before it lets anything be published. A second implementation for the browser
 * would be a second opinion on what a document means, and the two would
 * eventually disagree in the one direction that matters: the editor saying a
 * document is fine and the API refusing it.
 *
 * **What a document cannot be checked for on its own** is whether the media it
 * names exists. That answer lives in the library rather than in the text, so it
 * is passed in. The API passes what the database holds; the editor passes what
 * it has loaded for its own picker (#44). Without one, every other check still
 * runs and media names are taken on trust.
 *
 * **Errors stop a publication; warnings do not.** A deprecated name still
 * renders, which is the entire reason the register keeps answering to it.
 */

/** What the validator needs besides the document. */
export type ValidateOptions = {
  /**
   * Every name the media library answers to.
   *
   * A set rather than a lookup function, because a near miss is the commonest
   * mistake in a media name and suggesting the right one needs the names.
   */
  media?: ReadonlySet<string>;
  /** Which register to check against. The real one unless a test says otherwise. */
  register?: Register;
};

/** Somewhere to put a finding, with its line and column still to be worked out. */
type Report = (finding: Omit<Finding, "line" | "column">) => void;

/** What every check is given, so that none of them takes eight arguments. */
type Context = {
  text: string;
  media?: ReadonlySet<string>;
  register?: Register;
  report: Report;
};

/** The component a check is about, and what the register says about it. */
type Subject = { name: string; definition: ComponentDefinition };

/** A parameter and the name it is written under. */
type Bound = { name: string; parameter: Parameter };

/**
 * Checks a document.
 *
 * @param text - The document as written.
 * @param options - What is known besides the text.
 * @returns Everything found, and whether this may be published.
 */
export function validateContent(text: string, options: ValidateOptions = {}): Validation {
  return validateTree(parseContent(text), text, options);
}

/**
 * Checks a document that has already been parsed.
 *
 * This is what the editor calls, because CodeMirror keeps a tree of its own and
 * parsing a second one on every keystroke would be both slower and a second
 * answer to what the document means.
 *
 * @param tree - The tree, whose positions are positions in `text`.
 * @param text - The document the tree was parsed from.
 * @param options - What is known besides the text.
 * @returns Everything found, in document order, and whether this may be
 *   published.
 */
export function validateTree(tree: Tree, text: string, options: ValidateOptions = {}): Validation {
  const findings: Finding[] = [];
  const place = placesIn(text);

  const context: Context = {
    text,
    media: options.media,
    register: options.register,
    report: (finding) => findings.push({ ...finding, ...place(finding.from) }),
  };

  tree.iterate({
    enter(node) {
      if (node.name === NODE.ComponentError) {
        reportUnreadable(node.node, context);
        // What is under here belongs to a component that was never read to its
        // end. Checking it would report a missing body and a missing parameter
        // on top of the one brace that caused all three.
        return false;
      }

      if (node.name === NODE.Component) checkComponent(node.node, context);
      return true;
    },
  });

  findings.sort((one, other) => one.from - other.from);
  return { findings, publishable: findings.every((finding) => finding.severity !== "error") };
}

/**
 * Checks one component: its name, its body, and its arguments.
 *
 * @param node - The component node.
 * @param context - The document and where to report.
 */
function checkComponent(node: SyntaxNode, context: Context): void {
  const nameNode = childOf(node, NODE.ComponentName);
  if (!nameNode) return;

  const written = context.text.slice(nameNode.from, nameNode.to);
  const resolution = resolveComponent(written, context.register);

  if (!resolution.found) {
    context.report({
      code: FINDING.UnknownComponent,
      severity: "error",
      message: resolution.suggestion
        ? `${written} is not a component. Did you mean ${resolution.suggestion}?`
        : `${written} is not a component.`,
      from: nameNode.from,
      to: nameNode.to,
      component: written,
      suggestion: resolution.suggestion,
    });
    return;
  }

  const subject: Subject = { name: resolution.name, definition: resolution.definition };

  if (resolution.deprecated) {
    context.report({
      code: FINDING.DeprecatedComponent,
      severity: "warning",
      message: resolution.deprecated,
      from: nameNode.from,
      to: nameNode.to,
      component: subject.name,
      value: written,
    });
  }

  checkBody(node, nameNode, subject, context);
  checkArguments(node, nameNode, subject, context);
}

/**
 * Checks that a component has a body when it needs one and none when it holds
 * nothing.
 *
 * @param node - The component node.
 * @param nameNode - Its name, which is what a missing body is reported against.
 * @param subject - What the register says this component is.
 * @param context - The document and where to report.
 */
function checkBody(node: SyntaxNode, nameNode: SyntaxNode, subject: Subject, context: Context): void {
  const bodyNode = childOf(node, NODE.ComponentBody);

  if (bodyNode && subject.definition.body === "never") {
    context.report({
      code: FINDING.BodyNotAccepted,
      severity: "error",
      message: `${subject.name} takes no body.`,
      from: bodyNode.from,
      to: bodyNode.to,
      component: subject.name,
    });
  }

  if (!bodyNode && subject.definition.body === "required") {
    context.report({
      code: FINDING.MissingBody,
      severity: "error",
      message: `${subject.name} needs a body.`,
      from: nameNode.from,
      to: nameNode.to,
      component: subject.name,
    });
  }
}

/**
 * Binds each written argument to a parameter and checks what it was given.
 *
 * @param node - The component node.
 * @param nameNode - Its name, which is what a missing parameter is reported
 *   against, because the component is what lacks it.
 * @param subject - What the register says this component is.
 * @param context - The document and where to report.
 */
function checkArguments(node: SyntaxNode, nameNode: SyntaxNode, subject: Subject, context: Context): void {
  const supplied = new Set<string>();
  let unnamedTaken = false;

  for (const argument of argumentsOf(node)) {
    const valueNode = writtenValueOf(argument);
    if (!valueNode) continue;

    const nameChild = childOf(argument, NODE.ArgumentName);

    if (nameChild) {
      const bound = bindByName(nameChild, subject, supplied, context);
      if (!bound) continue;
      supplied.add(bound.name);
      checkValue(bound, valueNode, subject, context);
      continue;
    }

    const bound = bindWithoutName(valueNode, subject, unnamedTaken, context);
    if (!bound) continue;
    unnamedTaken = true;
    supplied.add(bound.name);
    checkValue(bound, valueNode, subject, context);
  }

  checkRequired(nameNode, subject, supplied, context);
}

/**
 * Works out which parameter a named argument is.
 *
 * @param nameChild - The argument's name node.
 * @param subject - What the register says this component is.
 * @param supplied - The parameters written so far, which is how a second one
 *   under the same name is caught.
 * @param context - The document and where to report.
 * @returns The parameter, or nothing when it was reported instead.
 */
function bindByName(
  nameChild: SyntaxNode,
  subject: Subject,
  supplied: ReadonlySet<string>,
  context: Context,
): Bound | null {
  const written = context.text.slice(nameChild.from, nameChild.to);
  const parameter = subject.definition.parameters[written];

  if (!parameter) {
    const suggestion = nearestName(written, Object.keys(subject.definition.parameters));
    context.report({
      code: FINDING.UnknownParameter,
      severity: "error",
      message: suggestion
        ? `${subject.name} has no parameter called ${written}. Did you mean ${suggestion}?`
        : `${subject.name} has no parameter called ${written}.`,
      from: nameChild.from,
      to: nameChild.to,
      component: subject.name,
      parameter: written,
      suggestion,
    });
    return null;
  }

  if (supplied.has(written)) {
    context.report({
      code: FINDING.DuplicateParameter,
      severity: "error",
      message: `${written} is written twice.`,
      from: nameChild.from,
      to: nameChild.to,
      component: subject.name,
      parameter: written,
    });
    return null;
  }

  return { name: written, parameter };
}

/**
 * Works out which parameter a value written without a name belongs to.
 *
 * @param valueNode - The value, which is what a refusal is reported against.
 * @param subject - What the register says this component is.
 * @param unnamedTaken - Whether one has already been written.
 * @param context - The document and where to report.
 * @returns The parameter, or nothing when it was reported instead.
 */
function bindWithoutName(
  valueNode: SyntaxNode,
  subject: Subject,
  unnamedTaken: boolean,
  context: Context,
): Bound | null {
  const unnamed = unnamedParameter(subject.definition);

  if (!unnamed) {
    context.report({
      code: FINDING.UnnamedNotAccepted,
      severity: "error",
      message: `${subject.name} takes no value written first without a name.`,
      from: valueNode.from,
      to: valueNode.to,
      component: subject.name,
      value: context.text.slice(valueNode.from, valueNode.to),
    });
    return null;
  }

  if (unnamedTaken) {
    context.report({
      code: FINDING.UnnamedNotAccepted,
      severity: "error",
      message: `Only one value may be written without a name, and ${subject.name} already has one.`,
      from: valueNode.from,
      to: valueNode.to,
      component: subject.name,
      value: context.text.slice(valueNode.from, valueNode.to),
    });
    return null;
  }

  return unnamed;
}

/**
 * Reports every parameter the component cannot be written without and was.
 *
 * @param nameNode - The component's name, which is what this is reported
 *   against: there is no argument to point at, because the point is that there
 *   is not one.
 * @param subject - What the register says this component is.
 * @param supplied - What was actually written.
 * @param context - The document and where to report.
 */
function checkRequired(
  nameNode: SyntaxNode,
  subject: Subject,
  supplied: ReadonlySet<string>,
  context: Context,
): void {
  for (const [name, parameter] of Object.entries(subject.definition.parameters)) {
    if (!parameter.required || supplied.has(name)) continue;

    context.report({
      code: FINDING.MissingParameter,
      severity: "error",
      message: `${subject.name} is missing ${name}.`,
      from: nameNode.from,
      to: nameNode.to,
      component: subject.name,
      parameter: name,
    });
  }
}

/**
 * Checks one written value against what its parameter accepts.
 *
 * The written form is compared as well as the value, because a keyword where a
 * number belongs has to be reportable as exactly that. That is why the parser
 * keeps the three forms apart rather than handing everything over as a string.
 *
 * @param bound - The parameter and the name it goes by.
 * @param valueNode - The value as written.
 * @param subject - What the register says this component is.
 * @param context - The document and where to report.
 */
function checkValue(bound: Bound, valueNode: SyntaxNode, subject: Subject, context: Context): void {
  const raw = context.text.slice(valueNode.from, valueNode.to);
  const written = writtenKindOf(valueNode);
  const { parameter } = bound;

  const refuse = () =>
    context.report({
      code: FINDING.ValueNotPermitted,
      severity: "error",
      message: `${raw} is not a value for ${bound.name}, which takes ${accepts(parameter)}.`,
      from: valueNode.from,
      to: valueNode.to,
      component: subject.name,
      parameter: bound.name,
      value: raw,
    });

  switch (parameter.kind) {
    case "text":
      if (written !== "string") refuse();
      return;

    case "slug":
      if (written !== "string") refuse();
      else checkSlug(unquote(raw), valueNode, bound, subject, context);
      return;

    case "number":
      if (written !== "number" || !withinRange(Number(raw), parameter.range)) refuse();
      return;

    case "step":
      if (written !== "number" || !isSpaceStep(raw)) refuse();
      return;

    case "flag":
      if (raw !== "true" && raw !== "false") refuse();
      return;

    case "keyword":
      if (written !== "keyword" || !(parameter.values ?? []).includes(raw)) refuse();
      return;

    case "icon":
      // Only that it is a bare word. The icon families are not in the
      // repository yet (#18); when they are, this reads their names exactly as
      // `keyword` reads the list the register gives it.
      if (written !== "keyword") refuse();
      return;
  }
}

/**
 * Checks that the media library holds what a value names.
 *
 * @param slug - The name, with its quotes removed.
 * @param valueNode - Where it was written.
 * @param bound - The parameter it was written for.
 * @param subject - What the register says this component is.
 * @param context - The document, the library, and where to report.
 */
function checkSlug(
  slug: string,
  valueNode: SyntaxNode,
  bound: Bound,
  subject: Subject,
  context: Context,
): void {
  const library = context.media;
  if (!library || library.has(slug)) return;

  const suggestion = nearestName(slug, library);
  context.report({
    code: FINDING.UnknownMedia,
    severity: "error",
    message: suggestion
      ? `The media library has no file called ${slug}. Did you mean ${suggestion}?`
      : `The media library has no file called ${slug}.`,
    from: valueNode.from,
    to: valueNode.to,
    component: subject.name,
    parameter: bound.name,
    value: slug,
    suggestion,
  });
}

/**
 * Reports a component the parser could not read.
 *
 * The tree says that something is wrong here and nothing more, because a node
 * is a type and a range. The scanner is what knows what was wrong, so it is
 * asked again at the same position. It is the same function that produced the
 * node, so the two cannot disagree.
 *
 * @param node - The error node.
 * @param context - The document and where to report.
 */
function reportUnreadable(node: SyntaxNode, context: Context): void {
  const found = scanComponent(context.text, node.from);
  const error = found?.error;

  if (!error) {
    context.report({
      code: FINDING.Unreadable,
      severity: "error",
      message: "This component could not be read.",
      from: node.from,
      to: node.to,
    });
    return;
  }

  context.report({
    code: FINDING.Unclosed,
    severity: "error",
    message: error.message,
    // The bracket or brace itself, so the underline sits on the character that
    // has to be matched rather than on everything it swallowed.
    from: error.at,
    to: error.at + 1,
    component: found?.name.text,
  });
}

/** Whether a number is inside a range, both ends included. */
function withinRange(value: number, range: Parameter["range"]): boolean {
  return !range || (value >= range[0] && value <= range[1]);
}

/** Whether a bare number names a step of the space scale. */
function isSpaceStep(raw: string): boolean {
  return (SPACE_STEPS as readonly string[]).includes(raw);
}
