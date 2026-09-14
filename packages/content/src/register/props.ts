import type { SpaceStep } from "@layered/tokens";
import type { ComponentName, components } from "./components.js";
import type { Parameter } from "./kinds.js";

/**
 * The props each component takes, worked out from the register rather than
 * written beside it.
 *
 * This is what stops the register being a description of the components and the
 * renderer being a second, slightly different description of the same ones. A
 * parameter added above appears here; a parameter renamed above stops compiling
 * wherever the old name was used; a value list narrowed above narrows the type.
 *
 * None of it exists at run time. The register is the only thing that ships.
 */

/** Every component, as the type of the object that declares them. */
type Components = typeof components;

/** What one parameter accepts, as a TypeScript type. */
type ValueOf<P extends Parameter> = P extends { kind: "keyword"; values: readonly (infer V)[] }
  ? V
  : P extends { kind: "step" }
    ? SpaceStep
    : P extends { kind: "number" }
      ? number
      : P extends { kind: "flag" }
        ? boolean
        : string;

/** The parameters a component cannot be written without. */
type RequiredNames<N extends ComponentName> = {
  [K in keyof Components[N]["parameters"]]: Components[N]["parameters"][K] extends { required: true }
    ? K
    : never;
}[keyof Components[N]["parameters"]];

/** Everything else. */
type OptionalNames<N extends ComponentName> = Exclude<keyof Components[N]["parameters"], RequiredNames<N>>;

/**
 * What a renderer receives for one component.
 *
 * A component that takes a body receives it as `children`, which is where the
 * Markdown inside the braces has already become nodes.
 */
export type PropsOf<N extends ComponentName> = {
  [K in RequiredNames<N>]: ValueOf<Components[N]["parameters"][K] & Parameter>;
} & {
  [K in OptionalNames<N>]?: ValueOf<Components[N]["parameters"][K] & Parameter>;
} & (Components[N]["body"] extends "never" ? { children?: never } : { children: unknown });

/** The name a component's renderer is registered under. */
export type RendererName<N extends ComponentName> = Components[N]["renders"];
