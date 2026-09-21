import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Model } from "./model.js";

it("retains the interactive model without offering a download", () => {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(
    <Model slug="sample" alt="Sample model" media={() => ({ src: "/media/sample.glb" })} />,
  );
  expect(template.content.querySelector("model-viewer")?.getAttribute("src")).toBe("/media/sample.glb");
  expect(template.content.querySelector("a")).toBeNull();
  expect(template.content.querySelector("[download]")).toBeNull();
  expect(template.content.textContent).not.toMatch(/download/i);
});

it("provides an accessible zoom control and a window-sized dialog", () => {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(
    <Model slug="sample" alt="Sample model" media={() => ({ src: "/media/sample.glb" })} />,
  );
  expect(template.content.querySelector("button[data-model-zoom]")?.getAttribute("aria-label")).toBe(
    "Expand 3D view",
  );
  expect(template.content.querySelector("dialog")?.getAttribute("aria-label")).toBe("Sample model");
});
