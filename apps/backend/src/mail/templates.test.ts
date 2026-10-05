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
});
