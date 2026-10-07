import type { BilingualText } from "@layered/schemas";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import type { InterfaceLanguage } from "./dashboard-i18n.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { chooseTextLanguage } from "./test-support.js";
import { Translated } from "./translated.js";

afterEach(cleanup);

/** One card with a switch and one bilingual title, holding its own draft. */
function TitleCard({ id }: { id: string }) {
  const [value, setValue] = useState<BilingualText>({ en: "Workshop", de: "Werkstatt" });
  return (
    <section data-testid={id}>
      <Translated>
        <Translated.Switch />
        <Translated.Field id={id} label={`Title ${id}`} value={value} onChange={setValue} />
      </Translated>
    </section>
  );
}

function show(interfaceLanguage: InterfaceLanguage, ...ids: string[]) {
  render(
    <DashboardLanguageProvider language={interfaceLanguage}>
      {ids.map((id) => (
        <TitleCard key={id} id={id} />
      ))}
    </DashboardLanguageProvider>,
  );
}

it("starts on the interface language and shows that language's text alone", () => {
  show("de", "one");
  const field = screen.getByLabelText("Title one") as HTMLInputElement;
  expect(field.value).toBe("Werkstatt");
  expect(field.lang).toBe("de");
  expect(screen.queryByDisplayValue("Workshop")).toBeNull();
});

it("keeps what was typed in one language while the other one is shown", () => {
  show("en", "one");
  fireEvent.change(screen.getByLabelText("Title one"), { target: { value: "Bench" } });
  chooseTextLanguage("de");
  expect(screen.getByLabelText("Title one")).toHaveProperty("value", "Werkstatt");
  fireEvent.change(screen.getByLabelText("Title one"), { target: { value: "Werkbank" } });
  chooseTextLanguage("en");
  expect(screen.getByLabelText("Title one")).toHaveProperty("value", "Bench");
  chooseTextLanguage("de");
  expect(screen.getByLabelText("Title one")).toHaveProperty("value", "Werkbank");
});

it("gives every card its own choice", () => {
  show("en", "one", "two");
  chooseTextLanguage("de", screen.getByTestId("one"));
  expect(screen.getByLabelText("Title one")).toHaveProperty("value", "Werkstatt");
  expect(screen.getByLabelText("Title two")).toHaveProperty("value", "Workshop");
});
