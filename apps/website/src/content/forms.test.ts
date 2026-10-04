import { renderContent } from "@layered/content";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formsForPage, submitPageForm } from "./forms.js";
import { createRepository } from "./repository.js";

const form = {
  slug: "interest",
  name: "Interest",
  successMessage: { en: "Thanks", de: "Danke" },
  fields: [
    {
      key: "name",
      type: "shortText" as const,
      label: { en: "Name", de: "Name" },
      hint: { en: "", de: "" },
      required: true,
      minLength: 2,
      maxLength: 80,
      pattern: null,
    },
  ],
};
const repository = createRepository({
  entries: [
    {
      id: "1",
      title: "Interest",
      slug: "interest",
      path: "/interest/",
      language: "en",
      visibility: "public",
      kind: "page",
      publishedAt: null,
      updatedAt: null,
      body: 'Form("interest")',
      topics: [],
    },
  ],
  forms: [form],
  topics: [],
  media: [],
  redirects: [],
});
const entry = repository.entry("/interest/");
if (!entry) throw new Error("Test entry missing");
const nodes = renderContent(entry.body);

function request(name: string): Request {
  const body = new FormData();
  body.set("_form", "interest");
  body.set("_challenge", "signed");
  body.set("_language", "en");
  body.set("_website", "");
  body.set("name", name);
  return new Request("https://layered.work/interest/", { method: "POST", body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
});

describe("native page form submission", () => {
  it("keeps the entered value and field error when the backend refuses it", async () => {
    process.env.API_URL = "http://backend.test/";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "invalid_request", message: "Check the marked fields.", id: "error-1" },
          fieldErrors: { name: "Required" },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const submission = await submitPageForm(request("A"), repository, nodes, entry);
    expect(submission).toMatchObject({
      slug: "interest",
      httpStatus: 400,
      outcome: {
        status: "error",
        values: { name: "A" },
        errors: { name: "Required" },
        code: "invalid_request",
        errorId: "error-1",
      },
    });
    expect(fetcher.mock.calls[0]?.[0].pathname).toBe("/forms/interest/submissions");
  });

  it("shows a backend-confirmed success and obtains a fresh challenge for rendering", async () => {
    process.env.API_URL = "http://backend.test/";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { successMessage: "Thanks" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { challenge: "fresh" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const submission = await submitPageForm(request("Ada"), repository, nodes, entry);
    expect(submission).toMatchObject({ httpStatus: 200, outcome: { status: "success", message: "Thanks" } });
    const forms = await formsForPage(repository, nodes, "en", submission);
    expect(forms.interest?.challenge).toBe("fresh");
    expect(forms.interest?.outcome?.status).toBe("success");
  });
});
