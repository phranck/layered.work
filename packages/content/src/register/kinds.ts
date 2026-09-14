/**
 * What a component is, and what its parameters accept.
 *
 * These are the shapes the register is written in. They exist separately from
 * the register itself so that the register reads as a list of components rather
 * than as a list of components interleaved with the machinery for describing
 * them.
 */

/**
 * What kind of value a parameter takes, which decides both how it is written
 * and what checking it means.
 *
 * The distinction between `step` and `number` is the one worth reading twice.
 * Both are written bare, as `spacing: 6`, and only one of them is a choice from
 * a closed set: a step that is not on the scale has no custom property behind
 * it and would silently render as nothing.
 */
export type ParameterKind =
  /** Free text, written in quotes. */
  | "text"
  /** A whole number written bare, checked against a range. */
  | "number"
  /** `true` or `false`, written bare. */
  | "flag"
  /** A bare word from a closed set the register names. */
  | "keyword"
  /** A step of the space scale, written bare as a number. */
  | "step"
  /** The name of a file in the media library, written in quotes. */
  | "slug"
  /** An icon, written bare. The set is large and lives in the icon package. */
  | "icon";

/** One parameter of one component. */
export type Parameter = {
  kind: ParameterKind;
  /** What it is for, in the words the editor shows beside it. */
  description: string;
  /** Whether a document is refused without it. */
  required?: boolean;
  /** What it is when nothing is written. Never set on a required parameter. */
  default?: string | number | boolean;
  /** For `keyword`, the words it accepts. Nothing else may name this. */
  values?: readonly string[];
  /** For `number`, the range it accepts, both ends included. */
  range?: readonly [number, number];
};

/** Whether a component takes a body, and whether it insists on one. */
export type BodyRule = "required" | "optional" | "never";

/** A name this component used to have, and what to tell somebody still using it. */
export type Alias = { readonly was: string; readonly message: string };

/** One component, as everything else reads it. */
export type ComponentDefinition = {
  /** The one line the editor shows in its completion list. */
  description: string;
  /** Whether it wraps content, and whether it must. */
  body: BodyRule;
  /**
   * Which parameter may be written first without its name.
   *
   * `Image("soundbox-front")` rather than `Image(slug: "soundbox-front")`. Only
   * one may be, and it is named here rather than being "the first one declared",
   * because the order of the parameters below is for a person reading them.
   */
  unnamed?: string;
  parameters: Readonly<Record<string, Parameter>>;
  /**
   * What renders it, by name.
   *
   * A name rather than an import, because this package is read by the parser
   * and the validator as well, and neither of those should pull a renderer in
   * to find out what a component is called.
   */
  renders: string;
  /** Names this component has been called before. */
  aliases?: readonly Alias[];
};

/** Every component, by name. */
export type Register = Readonly<Record<string, ComponentDefinition>>;
