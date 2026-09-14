/**
 * The node types the language adds to Markdown's.
 *
 * Named as one list so that the parser, the highlighting and anything walking a
 * tree agree on the spelling. A name typed out at a second call site is a node
 * that silently never matches.
 */

/** Every node this extension defines. */
export const NODE = {
  /** A whole component, from its name to its closing bracket or brace. */
  Component: "Component",
  /** The name, which is what the register is looked up by. */
  ComponentName: "ComponentName",
  /** The bracketed list, including the brackets. */
  ComponentArguments: "ComponentArguments",
  /** One argument, with its name when it has one. */
  ComponentArgument: "ComponentArgument",
  /** The name of one argument, without its colon. */
  ArgumentName: "ArgumentName",
  /** A value written in quotes. */
  ArgumentString: "ArgumentString",
  /** A value written as a bare number. */
  ArgumentNumber: "ArgumentNumber",
  /** A value written as a bare word. */
  ArgumentKeyword: "ArgumentKeyword",
  /** A value in none of the three forms, which the validator reports. */
  ArgumentUnknown: "ArgumentUnknown",
  /** What sits between the braces. Markdown again, and parsed as such. */
  ComponentBody: "ComponentBody",
  /** A component that could not be read, which is marked rather than swallowed. */
  ComponentError: "ComponentError",
} as const;

/** One of the node names above. */
export type NodeName = (typeof NODE)[keyof typeof NODE];

/** What a value's written form is called as a node. */
export const VALUE_NODE = {
  string: NODE.ArgumentString,
  number: NODE.ArgumentNumber,
  keyword: NODE.ArgumentKeyword,
  unknown: NODE.ArgumentUnknown,
} as const;
