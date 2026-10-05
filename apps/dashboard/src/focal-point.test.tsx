import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { FocalPointEditor } from "./focal-point.js";
import { DashboardLanguageProvider } from "./language-context.js";

afterEach(cleanup);
function Example() {
  const [point, setPoint] = useState({ x: 0.5, y: 0.5 });
  return (
    <DashboardLanguageProvider language="de">
      <FocalPointEditor src="/test.png" point={point} onChange={setPoint} />
    </DashboardLanguageProvider>
  );
}
it("updates the marker and every crop live from the keyboard", () => {
  render(<Example />);
  const marker = screen.getByRole("button", { name: "Fokuspunkt verschieben" });
  fireEvent.keyDown(marker, { key: "ArrowLeft", shiftKey: true });
  fireEvent.keyDown(marker, { key: "ArrowDown" });
  expect(screen.getByText("40%, 51%")).toBeTruthy();
  for (const image of screen.getAllByRole("img")) expect(image.style.objectPosition).toBe("40% 51%");
});

it("maps pointer coordinates to the uncropped source image and clamps its bounds", () => {
  render(<Example />);
  const marker = screen.getByRole("button", { name: "Fokuspunkt verschieben" });
  marker.getBoundingClientRect = () => ({
    left: 20,
    top: 10,
    width: 200,
    height: 100,
    right: 220,
    bottom: 110,
    x: 20,
    y: 10,
    toJSON: () => ({}),
  });
  marker.setPointerCapture = () => {};
  marker.hasPointerCapture = () => true;
  marker.releasePointerCapture = () => {};
  fireEvent.pointerDown(marker, { button: 0, pointerId: 1, clientX: 160, clientY: 30 });
  expect(screen.getByText("70%, 20%")).toBeTruthy();
  fireEvent.pointerMove(marker, { pointerId: 1, clientX: 400, clientY: -20 });
  expect(screen.getByText("100%, 0%")).toBeTruthy();
});
