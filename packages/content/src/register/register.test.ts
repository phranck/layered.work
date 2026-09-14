import { SPACE_STEPS, STATUS_TONES } from "@layered/tokens";
import { describe, expect, it } from "vitest";
import { COMPONENT_NAMES, components } from "./components.js";
import type { Register } from "./kinds.js";
import { completionList, defaultsOf, resolveComponent, unnamedParameter } from "./lookup.js";

/**
 * What has to hold of the register itself, whatever is in it.
 *
 * The components and their parameters are decisions, so they are not pinned
 * here: a test asserting that `Note` has a `title` fires the day somebody
 * decides it should not. What is tested is the shape every entry has to have
 * for the parser, the validator and the renderer to be able to read it, which
 * is the thing that can actually be wrong.
 */

/**
 * The register seen as the shape rather than as exactly what is written.
 *
 * `as const satisfies Register` narrows each entry to its own literal type, so
 * an optional property nothing currently uses, such as `unnamed` or `aliases`,
 * is absent from the type of the entries that do not declare it. Reading
 * through the shape is how every consumer reads it, and is what these tests are
 * about.
 */
const register: Register = components;

describe("every entry", () => {
  it.each(COMPONENT_NAMES)("%s is complete enough to be read", (name) => {
    const definition = register[name] as (typeof register)[string];
    expect(definition.description.length, "the editor shows this in its list").toBeGreaterThan(0);
    expect(definition.renders.length, "something has to render it").toBeGreaterThan(0);
    expect(["required", "optional", "never"]).toContain(definition.body);
  });

  it.each(COMPONENT_NAMES)("%s names an unnamed parameter that exists", (name) => {
    const definition = register[name] as (typeof register)[string];
    if (!definition.unnamed) return;

    expect(Object.keys(definition.parameters)).toContain(definition.unnamed);
    expect(unnamedParameter(definition)?.name).toBe(definition.unnamed);
  });

  it.each(COMPONENT_NAMES)("%s describes each of its parameters", (name) => {
    for (const [parameterName, parameter] of Object.entries(components[name].parameters)) {
      expect(parameter.description.length, `${name}.${parameterName}`).toBeGreaterThan(0);
    }
  });

  it.each(COMPONENT_NAMES)("%s gives a keyword parameter the words it accepts", (name) => {
    for (const [parameterName, parameter] of Object.entries(components[name].parameters)) {
      if (parameter.kind !== "keyword") continue;
      expect(parameter.values, `${name}.${parameterName}`).toBeDefined();
      expect(parameter.values?.length, `${name}.${parameterName}`).toBeGreaterThan(0);
    }
  });

  it.each(COMPONENT_NAMES)("%s never gives a required parameter a default", (name) => {
    // A default on a required parameter means it is not required, and the two
    // would then disagree about whether a document without it is refused.
    for (const [parameterName, parameter] of Object.entries(components[name].parameters)) {
      if (!parameter.required) continue;
      expect(parameter.default, `${name}.${parameterName}`).toBeUndefined();
    }
  });

  it.each(COMPONENT_NAMES)("%s gives a default that is one of the permitted words", (name) => {
    for (const [parameterName, parameter] of Object.entries(components[name].parameters)) {
      if (parameter.kind !== "keyword" || parameter.default === undefined) continue;
      expect(parameter.values, `${name}.${parameterName}`).toContain(parameter.default);
    }
  });

  it.each(COMPONENT_NAMES)("%s gives a step default that is on the scale", (name) => {
    for (const [parameterName, parameter] of Object.entries(components[name].parameters)) {
      if (parameter.kind !== "step" || parameter.default === undefined) continue;
      expect(SPACE_STEPS, `${name}.${parameterName}`).toContain(String(parameter.default));
    }
  });

  it.each(COMPONENT_NAMES)("%s gives a number default inside its range", (name) => {
    for (const [parameterName, parameter] of Object.entries(components[name].parameters)) {
      if (parameter.kind !== "number" || parameter.default === undefined) continue;
      const [low, high] = parameter.range ?? [Number.NaN, Number.NaN];
      expect(parameter.default, `${name}.${parameterName}`).toBeGreaterThanOrEqual(low as number);
      expect(parameter.default, `${name}.${parameterName}`).toBeLessThanOrEqual(high as number);
    }
  });
});

describe("where the values come from", () => {
  it("offers the space scale's steps rather than a list of its own", () => {
    // The acceptance this register was written against. A step added to
    // `scale.css` has to reach an author with nothing else edited.
    const spacing = components.VStack.parameters.spacing;
    expect(spacing.kind).toBe("step");
    expect(SPACE_STEPS.length).toBeGreaterThan(0);
    expect(String(spacing.default)).toBeOneOf([...SPACE_STEPS]);
  });

  it("offers the palette's status colours as a note's tones", () => {
    expect(components.Note.parameters.tone.values).toBe(STATUS_TONES);
  });

  it("does not offer a status colour where the question is importance", () => {
    // A button's tone says how much it asks to be pressed. They meet at
    // `danger` and mean the same thing there, and nowhere else.
    const tones = components.Button.parameters.tone.values;
    expect(tones).toContain("primary");
    expect(tones).not.toContain("info");
  });
});

describe("looking a name up", () => {
  it("finds one that is written correctly", () => {
    const found = resolveComponent("HStack");
    expect(found.found).toBe(true);
    expect(found.found && found.name).toBe("HStack");
  });

  it("does not find one that is not there", () => {
    expect(resolveComponent("Carousel").found).toBe(false);
  });

  it("suggests the nearest name for a near miss", () => {
    const missed = resolveComponent("VStac");
    expect(missed.found).toBe(false);
    expect(!missed.found && missed.suggestion).toBe("VStack");
  });

  it("suggests nothing for a name that is not a near miss", () => {
    // Offering `Card` to somebody who wrote `Carousel` is worse than offering
    // nothing: it reads as though the two were related.
    const missed = resolveComponent("Carousel");
    expect(!missed.found && missed.suggestion).toBeUndefined();
  });

  it("is case-sensitive, because the syntax is", () => {
    expect(resolveComponent("vstack").found).toBe(false);
  });
});

describe("a component that has been renamed", () => {
  /** A register with a deprecation in it, since the real one has none yet. */
  const withAnOldName: Register = {
    ...components,
    Note: { ...components.Note, aliases: [{ was: "Callout", message: "Callout is now Note." }] },
  };

  it("is still found under the name it used to have", () => {
    const found = resolveComponent("Callout", withAnOldName);
    expect(found.found).toBe(true);
    expect(found.found && found.name).toBe("Note");
  });

  it("comes back with the message to show", () => {
    const found = resolveComponent("Callout", withAnOldName);
    expect(found.found && found.deprecated).toBe("Callout is now Note.");
  });

  it("is not deprecated under its current name", () => {
    const found = resolveComponent("Note", withAnOldName);
    expect(found.found && found.deprecated).toBeUndefined();
  });
});

describe("what the editor is given", () => {
  it("lists every component in the order the register declares them", () => {
    expect(completionList().map((entry) => entry.name)).toEqual(COMPONENT_NAMES);
  });

  it("says of each whether it takes a body, so the editor can offer the braces", () => {
    const byName = new Map(completionList().map((entry) => [entry.name, entry]));
    expect(byName.get("VStack")?.takesBody).toBe(true);
    expect(byName.get("Divider")?.takesBody).toBe(false);
  });

  it("carries the parameters so they can be offered inside the brackets", () => {
    const image = completionList().find((entry) => entry.name === "Image");
    expect(image?.parameters).toContain("slug");
  });
});

describe("the defaults", () => {
  it("are only the parameters that have one", () => {
    const defaults = defaultsOf(components.Image);
    // Every parameter of an image is either required or genuinely absent when
    // not written, so applying a default would invent a caption.
    expect(defaults).toEqual({});
  });

  it("carry what a component is when nothing is said", () => {
    expect(defaultsOf(components.Note)).toEqual({ tone: "info" });
  });
});
