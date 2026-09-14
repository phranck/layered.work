/**
 * Finding where a component starts and where it ends, without knowing anything
 * about Markdown or about Lezer.
 *
 * The awkward part of this language is not its grammar, which has three forms
 * and no more. It is knowing where a brace is a brace: inside a quoted string
 * it is a character, inside a fenced code block it is somebody's example, and
 * nested inside another component it belongs to that one. Every one of those is
 * a counting problem over the raw text, so it is solved here, once, with no
 * parser around it, and the block parser that follows only has to place nodes.
 */

/** Where one argument was written, and what kind of thing it is. */
export type ScannedArgument = {
  /** Absent for the value written first without a name. */
  name?: { from: number; to: number; text: string };
  value: { from: number; to: number; text: string; kind: ArgumentKind };
};

/** What a written value looks like, before anything knows what it should be. */
export type ArgumentKind = "string" | "number" | "keyword" | "unknown";

/** A component found in the text, with every part located. */
export type ScannedComponent = {
  from: number;
  to: number;
  name: { from: number; to: number; text: string };
  /** Absent when the component was written with no brackets at all. */
  arguments?: { from: number; to: number; items: ScannedArgument[] };
  /** Absent when the component was written with no body. */
  body?: { from: number; to: number; text: string };
  /** What is wrong, when something is. The component is still returned. */
  error?: ScanError;
};

/** Something the scanner could not make sense of. */
export type ScanError = {
  /** What went wrong, in a word something else can branch on. */
  code: "unclosed-arguments" | "unclosed-body";
  /** Where it was noticed. */
  at: number;
  /** Safe to show a person. */
  message: string;
};

/**
 * A component name: a capital, then letters and digits.
 *
 * Deliberately not `\w`, which would accept an underscore and make
 * `Some_thing(` a component. The language has no such name and never will.
 */
const NAME = /^[A-Z][A-Za-z0-9]*/;

/** What may sit between a name and its bracket or brace. Spaces, and nothing else. */
const GAP = /^[ \t]*/;

/**
 * Whether a component starts at this position.
 *
 * The position is expected to be the first non-whitespace character of a line;
 * the caller decides that, because what counts as the start of a line is the
 * block parser's business once list markers and quotes have been stripped.
 *
 * @param text - The whole document.
 * @param at - Where to look.
 * @returns Whether a name followed directly by `(` or `{` is there.
 */
export function startsComponent(text: string, at: number): boolean {
  if (text[at - 1] === "\\") return false;

  const name = NAME.exec(text.slice(at));
  if (!name) return false;

  const after = at + name[0].length;
  const gap = GAP.exec(text.slice(after))?.[0].length ?? 0;
  const next = text[after + gap];

  // `(` may follow immediately or not at all; `{` needs the gap to be there or
  // not, but either way the next thing has to be one of the two. A capitalised
  // word followed by anything else is a sentence.
  return next === "(" || next === "{";
}

/**
 * Reads one component out of the text.
 *
 * @param text - The whole document.
 * @param at - Where the name starts.
 * @returns What was found, or null when nothing starts here. A component with
 *   something wrong with it comes back with an `error` rather than as null, so
 *   the caller can mark it and carry on with the rest of the document.
 */
export function scanComponent(text: string, at: number): ScannedComponent | null {
  const match = NAME.exec(text.slice(at));
  if (!match || !startsComponent(text, at)) return null;

  const name = { from: at, to: at + match[0].length, text: match[0] };
  let cursor = name.to + (GAP.exec(text.slice(name.to))?.[0].length ?? 0);

  let argumentsPart: ScannedComponent["arguments"];
  if (text[cursor] === "(") {
    const closing = findClosing(text, cursor, "(", ")", true);
    if (closing === null) {
      return {
        from: at,
        to: text.length,
        name,
        error: {
          code: "unclosed-arguments",
          at: cursor,
          message: `${name.text} has a bracket that is never closed.`,
        },
      };
    }
    argumentsPart = {
      from: cursor,
      to: closing + 1,
      items: readArguments(text, cursor + 1, closing),
    };
    cursor = closing + 1;
  }

  cursor += GAP.exec(text.slice(cursor))?.[0].length ?? 0;

  let body: ScannedComponent["body"];
  if (text[cursor] === "{") {
    const closing = findClosing(text, cursor, "{", "}", false);
    if (closing === null) {
      return {
        from: at,
        to: text.length,
        name,
        arguments: argumentsPart,
        error: {
          code: "unclosed-body",
          at: cursor,
          message: `${name.text} has a body that is never closed.`,
        },
      };
    }
    body = { from: cursor + 1, to: closing, text: text.slice(cursor + 1, closing) };
    cursor = closing + 1;
  }

  return { from: at, to: cursor, name, arguments: argumentsPart, body };
}

/**
 * Finds the bracket or brace that closes the one at `from`.
 *
 * Counts nesting and skips whole fenced code blocks, because a brace in an
 * example somebody wrote is a character rather than a delimiter. That is the
 * rule the epic states as fenced code being recognised before anything else.
 *
 * **Quotes only delimit inside an argument list.** Between the brackets a
 * string is a value, so `caption: "A } in it"` has to be read as one. Inside a
 * body the content is Markdown, where a double quote is a quotation mark and
 * nothing else: `He said "look }" and left.` has to behave exactly as
 * `He said look } and left.` does, and a brace that genuinely has to be written
 * there is escaped as `\}`, which is Markdown's own escape.
 *
 * @param text - The whole document.
 * @param from - The position of the opening character.
 * @param open - The opening character.
 * @param close - The one that closes it.
 * @param quotesDelimit - Whether a quotation mark starts a string here.
 * @returns Where the closing character is, or null when there is none.
 */
function findClosing(
  text: string,
  from: number,
  open: string,
  close: string,
  quotesDelimit: boolean,
): number | null {
  let depth = 0;

  for (let at = from; at < text.length; at += 1) {
    const character = text[at];

    if (character === "\\") {
      // Whatever follows is a character. This is what lets a body hold a brace.
      at += 1;
      continue;
    }

    if (quotesDelimit && (character === '"' || character === "'")) {
      at = endOfString(text, at);
      continue;
    }

    if (character === "`" && isFenceOpening(text, at)) {
      const fence = endOfFence(text, at);
      if (fence === null) break;
      at = fence;
      continue;
    }

    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }

  return null;
}

/**
 * Where a quoted string ends.
 *
 * @param text - The whole document.
 * @param at - The position of the opening quote.
 * @returns The position of the closing quote, or the end of the line when there
 *   is none, because a string is not allowed to run past one and treating it as
 *   unterminated for ever would swallow the document.
 */
function endOfString(text: string, at: number): number {
  const quote = text[at];

  for (let cursor = at + 1; cursor < text.length; cursor += 1) {
    if (text[cursor] === "\\") {
      cursor += 1;
      continue;
    }
    if (text[cursor] === "\n") return cursor - 1;
    if (text[cursor] === quote) return cursor;
  }

  return text.length - 1;
}

/** Whether three backticks start here, at the start of a line. */
function isFenceOpening(text: string, at: number): boolean {
  if (text.slice(at, at + 3) !== "```") return false;
  const lineStart = text.lastIndexOf("\n", at) + 1;
  return text.slice(lineStart, at).trim() === "";
}

/**
 * Where a fenced code block ends.
 *
 * @param text - The whole document.
 * @param at - The position of the opening backticks.
 * @returns The position of the last character of the closing fence, or null
 *   when the fence is never closed.
 */
function endOfFence(text: string, at: number): number | null {
  let cursor = text.indexOf("\n", at);

  while (cursor !== -1) {
    const lineEnd = text.indexOf("\n", cursor + 1);
    const line = text.slice(cursor + 1, lineEnd === -1 ? text.length : lineEnd);
    if (line.trim().startsWith("```")) {
      return cursor + 1 + line.length - 1;
    }
    if (lineEnd === -1) return null;
    cursor = lineEnd;
  }

  return null;
}

/**
 * Reads the arguments between the brackets.
 *
 * @param text - The whole document.
 * @param from - Just after the opening bracket.
 * @param to - The closing bracket.
 */
function readArguments(text: string, from: number, to: number): ScannedArgument[] {
  const items: ScannedArgument[] = [];

  for (const span of splitTopLevel(text, from, to)) {
    const trimmed = trim(text, span.from, span.to);
    if (trimmed.from >= trimmed.to) continue;

    const colon = findNameColon(text, trimmed.from, trimmed.to);
    if (colon === null) {
      items.push({ value: readValue(text, trimmed.from, trimmed.to) });
      continue;
    }

    const nameSpan = trim(text, trimmed.from, colon);
    const valueSpan = trim(text, colon + 1, trimmed.to);
    items.push({
      name: { from: nameSpan.from, to: nameSpan.to, text: text.slice(nameSpan.from, nameSpan.to) },
      value: readValue(text, valueSpan.from, valueSpan.to),
    });
  }

  return items;
}

/**
 * The commas that actually separate arguments.
 *
 * A comma inside a string or inside a nested bracket separates nothing, which
 * is why this cannot be a `split`.
 */
function splitTopLevel(text: string, from: number, to: number): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  let start = from;
  let depth = 0;

  for (let at = from; at < to; at += 1) {
    const character = text[at];

    if (character === '"' || character === "'") {
      at = Math.min(endOfString(text, at), to - 1);
      continue;
    }
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth -= 1;
    else if (character === "," && depth === 0) {
      spans.push({ from: start, to: at });
      start = at + 1;
    }
  }

  spans.push({ from: start, to });
  return spans;
}

/**
 * The colon that separates a name from its value, if this argument has one.
 *
 * Only a colon at the top level counts, and only when what precedes it looks
 * like a name. `href: "https://example.invalid"` has two colons and one of them
 * is part of the value.
 */
function findNameColon(text: string, from: number, to: number): number | null {
  for (let at = from; at < to; at += 1) {
    const character = text[at];
    if (character === '"' || character === "'") return null;
    if (character === ":") {
      return /^[a-z][A-Za-z0-9]*$/.test(text.slice(from, at).trim()) ? at : null;
    }
    if (!/[A-Za-z0-9]/.test(character ?? "")) return null;
  }
  return null;
}

/** What a written value looks like. */
function readValue(text: string, from: number, to: number): ScannedArgument["value"] {
  const raw = text.slice(from, to);
  return { from, to, text: raw, kind: kindOf(raw) };
}

/**
 * Which of the three forms a value is written in.
 *
 * Told apart by shape alone. What a parameter actually accepts is the
 * register's business, and the validator is what compares the two: a keyword
 * written where a number belongs has to be reportable as exactly that, which
 * needs the written kind to survive parsing.
 */
function kindOf(raw: string): ArgumentKind {
  if (/^".*"$|^'.*'$/s.test(raw)) return "string";
  if (/^-?\d+(\.\d+)?$/.test(raw)) return "number";
  if (/^[a-z][A-Za-z0-9]*$/.test(raw)) return "keyword";
  return "unknown";
}

/** The span with its surrounding whitespace removed. */
function trim(text: string, from: number, to: number): { from: number; to: number } {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end -= 1;
  return { from: start, to: end };
}
