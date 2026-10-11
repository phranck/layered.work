import { MAIL_ELEMENTS } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAIL_TEMPLATES, renderMailTemplate, validateMailTemplate } from "./templates.js";

describe("mail template rendering", () => {
  it("renders both languages as safe HTML and plain text", () => {
    const template = DEFAULT_MAIL_TEMPLATES.submission_confirmation;
    const values = { formName: "<Contact>", submittedAt: "2026-10-05" };
    const english = renderMailTemplate(template, "en", values);
    const german = renderMailTemplate(template, "de", values);
    expect(english.subject).toContain("<Contact>");
    expect(english.text).toContain("<Contact>");
    expect(english.html).toContain("&lt;Contact&gt;");
    expect(german.subject).not.toBe(english.subject);
    expect(german.text).not.toBe(english.text);
  });

  it("fills placeholders that stand on a line of their own, which the content language reads as value references", () => {
    const rendered = renderMailTemplate(DEFAULT_MAIL_TEMPLATES.submission_notification, "en", {
      formName: "Contact",
      submittedAt: "2026-10-07",
      fields: "Name: Ada",
      consents: "Newsletter: yes",
    });
    expect(rendered.text).toContain("Name: Ada");
    expect(rendered.text).toContain("Newsletter: yes");
    expect(rendered.html).toContain("<p>Name: Ada</p>");
  });

  it("refuses unknown values by name and unsafe content components", () => {
    const template = DEFAULT_MAIL_TEMPLATES.submission_confirmation;
    expect(() =>
      validateMailTemplate({ ...template, body: { ...template.body, en: "{{missing}}" } }),
    ).toThrow("missing");
    expect(() =>
      validateMailTemplate({ ...template, body: { ...template.body, en: "<script>alert(1)</script>" } }),
    ).toThrow("HTML");
  });

  it("does not interpret submitted values as Markdown", () => {
    const rendered = renderMailTemplate(DEFAULT_MAIL_TEMPLATES.submission_confirmation, "en", {
      formName: "**<bad>**",
      submittedAt: "today",
    });
    expect(rendered.html).toContain("**&lt;bad&gt;**");
    expect(rendered.html).not.toContain("<bad>");
  });

  it("keeps email-safe lists and links in both alternatives", () => {
    const template = {
      ...DEFAULT_MAIL_TEMPLATES.submission_confirmation,
      body: {
        en: "- **Hello**\n- [Website](https://layered.work)",
        de: "- **Hallo**\n- [Website](https://layered.work)",
      },
    };
    const result = renderMailTemplate(template, "en", { formName: "Contact" });
    expect(result.html).toContain("<ul>");
    expect(result.html).toContain('<a href="https://layered.work">Website</a>');
    expect(result.text).toContain("- Website (https://layered.work)");
    expect(() =>
      validateMailTemplate({
        ...template,
        body: { ...template.body, en: "[bad](javascript:alert(1))" },
      }),
    ).toThrow("HTTP or HTTPS");
  });

  it("draws a list nested under an item and a paragraph continuing one", () => {
    const template = {
      ...DEFAULT_MAIL_TEMPLATES.submission_confirmation,
      body: { en: "- One\n\n  More on one.\n\n  - Inner\n- Two", de: "Zeile" },
    };
    const result = renderMailTemplate(template, "en", { formName: "Contact", submittedAt: "today" });
    expect(result.html).toContain(
      "><ul><li>One<br>More on one.<ul><li>Inner</li></ul></li><li>Two</li></ul></div>",
    );
    expect(result.text).toBe("- One\n  More on one.\n  - Inner\n- Two");
  });

  it("reads a line shaped like a component as words, which is all a mail holds", () => {
    const template = {
      ...DEFAULT_MAIL_TEMPLATES.submission_confirmation,
      body: { en: "Prototype(2)", de: "Zeile" },
    };
    const result = renderMailTemplate(template, "en", { formName: "Contact", submittedAt: "today" });
    expect(result.html).toContain("><p>Prototype(2)</p></div>");
  });

  it("states its own type, so every client draws the same message", () => {
    const result = renderMailTemplate(DEFAULT_MAIL_TEMPLATES.submission_confirmation, "de", {
      formName: "Kontakt",
      submittedAt: "heute",
    });
    expect(result.html).toMatch(/^<div lang="de" style="font-family: [^"]+">/);
  });

  it("renders only the elements the dashboard's preview rebuilds", () => {
    const template = {
      ...DEFAULT_MAIL_TEMPLATES.submission_notification,
      body: {
        en: "Line one\nline two with *emphasis* and **strength**\n\n1. [First](https://layered.work)\n2. Second\n\n- Bullet",
        de: "Zeile",
      },
    };
    const rendered = renderMailTemplate(template, "en", {
      formName: "Contact",
      submittedAt: "today",
      fields: "Name: Ada",
      consents: "none",
    });
    const elements = new Set([...rendered.html.matchAll(/<([a-z]+)[\s>]/g)].map((match) => match[1]));
    expect([...elements].sort()).toEqual([...MAIL_ELEMENTS].sort());
  });
});
