import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Model } from "./model.js";

it("shows the real poster before activation and enables automatic rotation", () => {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(
    <Model
      slug="sample"
      alt="Sample model"
      media={() => ({ src: "/media/sample.glb", poster: "/media/sample.webp" })}
    />,
  );
  const viewer = template.content.querySelector("model-viewer");
  expect(viewer?.getAttribute("data-model-src")).toBe("/media/sample.glb");
  expect(viewer?.getAttribute("src")).toBeNull();
  expect(viewer?.hasAttribute("auto-rotate")).toBe(true);
  expect(viewer?.querySelector('img[slot="poster"]')?.getAttribute("src")).toBe("/media/sample.webp");
});

it("retains the interactive model without offering a download", () => {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(
    <Model slug="sample" alt="Sample model" media={() => ({ src: "/media/sample.glb" })} />,
  );
  expect(template.content.querySelector("model-viewer")?.getAttribute("data-model-src")).toBe(
    "/media/sample.glb",
  );
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
