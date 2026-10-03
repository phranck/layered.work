import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as icons from "./icons.js";

/**
 * Every interface icon is drawn in Phosphor's duotone weight.
 *
 * Duotone is the weight that lays a translucent fill under the outline, which
 * is what the markup is checked for: a regular icon has no such fill.
 */
describe("the interface icons", () => {
  const exported = Object.entries(icons).filter(([name]) => name.endsWith("Icon"));

  it("are all exported through the duotone wrapper", () => {
    expect(exported.length).toBeGreaterThan(40);
  });

  it.each(exported)("%s is drawn in duotone", (_name, Icon) => {
    const Component = Icon as ComponentType;
    expect(renderToStaticMarkup(<Component />)).toContain('opacity="0.2"');
  });
});
