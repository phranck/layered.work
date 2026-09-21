import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Model } from "./model.js";
import { initializeModelViewports } from "./model-viewport.js";

const animations: { onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn> }[] = [];
const animate = vi.fn(() => {
  const animation = { onfinish: null as (() => void) | null, cancel: vi.fn() };
  animations.push(animation);
  return animation;
});
let root: HTMLDivElement;
let button: HTMLButtonElement;
let dialog: HTMLDialogElement;

beforeEach(() => {
  animations.length = 0;
  animate.mockClear();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <Model slug="sample" alt="Sample model" media={() => ({ src: "/media/sample.glb" })} />,
  );
  document.body.append(root);
  initializeModelViewports(root);
  const zoom = root.querySelector<HTMLButtonElement>("[data-model-zoom]");
  const modal = root.querySelector("dialog");
  if (!zoom || !modal) throw new Error("Missing model controls");
  button = zoom;
  dialog = modal;
  dialog.style.setProperty("--duration-slow", ".46s");
});
afterEach(() => {
  root.remove();
  vi.unstubAllGlobals();
});

it("animates expansion and keeps the original model until collapse finishes", () => {
  const viewer = root.querySelector("model-viewer");
  button.click();
  expect(dialog.open).toBe(true);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ duration: 460 }));
  animations[0]?.onfinish?.();
  button.click();
  expect(animate).toHaveBeenCalledTimes(2);
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector("model-viewer")).toBe(viewer);
  animations[1]?.onfinish?.();
  expect(dialog.open).toBe(false);
  expect(root.querySelector(".content-model__stage model-viewer")).toBe(viewer);
});

it("animates Escape even during expansion without starting duplicate closes", () => {
  button.click();
  const cancelEvent = new Event("cancel", { cancelable: true });
  dialog.dispatchEvent(cancelEvent);
  expect(cancelEvent.defaultPrevented).toBe(true);
  expect(animations[0]?.cancel).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(2);
  button.click();
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(animate).toHaveBeenCalledTimes(2);
  animations[1]?.onfinish?.();
  expect(dialog.open).toBe(false);
});

it("skips movement when reduced motion is requested", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  button.click();
  expect(dialog.open).toBe(true);
  button.click();
  expect(dialog.open).toBe(false);
  expect(animate).not.toHaveBeenCalled();
});
