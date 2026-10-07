import { forceLinting } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { contentLanguage } from "./content-editor.js";
import { contentValidation } from "./content-lint.js";
import type { CheckedContent } from "./content-validation.js";

/** What the editor's validator reports for a body, given the names of the values or none. */
async function checked(body: string, names?: ReadonlySet<string>): Promise<CheckedContent> {
  let reported: CheckedContent | undefined;
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: body,
      extensions: [
        contentLanguage(),
        contentValidation(
          (result) => {
            reported = result;
          },
          (finding) => finding.message,
          () => names,
        ),
      ],
    }),
  });
  forceLinting(view);
  await vi.waitFor(() => expect(reported).toBeDefined());
  view.destroy();
  return reported as CheckedContent;
}

describe("the editor's check of references to named values", () => {
  it("marks a name no value has, which blocks publishing, once the names are known", async () => {
    const result = await checked("Made with {{ prodcut }}.", new Set(["product"]));
    expect(result.validation.publishable).toBe(false);
    expect(result.validation.findings.map((finding) => [finding.code, finding.suggestion])).toEqual([
      ["unknown-value", "product"],
    ]);
  });

  it("takes references on trust while the names are not known yet", async () => {
    expect((await checked("Made with {{ prodcut }}.")).validation.publishable).toBe(true);
  });
});
