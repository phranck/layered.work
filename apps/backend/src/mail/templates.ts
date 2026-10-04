import { parseContent } from "@layered/content";
import {
  type MailTemplate,
  type MailTemplateKind,
  type RenderedMail,
  type SaveMailTemplateBody,
  saveMailTemplateBody,
} from "@layered/schemas";
import { eq } from "drizzle-orm";
import type { database } from "../db/connect.js";
import { auditLog, settings } from "../db/schema/index.js";

type Database = ReturnType<typeof database>;
type Language = "en" | "de";
type Node = ReturnType<typeof parseContent>["topNode"];

const VARIABLES: Record<MailTemplateKind, readonly string[]> = {
  submission_notification: ["formName", "submittedAt", "fields", "consents"],
  submission_confirmation: ["formName", "submittedAt"],
};

/** Defaults remain usable before an editor changes either template. */
export const DEFAULT_MAIL_TEMPLATES: Record<MailTemplateKind, MailTemplate> = {
  submission_notification: {
    kind: "submission_notification",
    name: { en: "Submission notification", de: "Benachrichtigung über Einsendung" },
    subject: { en: "New submission: {{formName}}", de: "Neue Einsendung: {{formName}}" },
    body: {
      en: "A new submission to **{{formName}}** arrived on {{submittedAt}}.\n\n{{fields}}\n\n{{consents}}",
      de: "Eine neue Einsendung für **{{formName}}** ist am {{submittedAt}} eingegangen.\n\n{{fields}}\n\n{{consents}}",
    },
    allowedVariables: [...VARIABLES.submission_notification],
  },
  submission_confirmation: {
    kind: "submission_confirmation",
    name: { en: "Submission confirmation", de: "Einsendebestätigung" },
    subject: {
      en: "We received your message to {{formName}}",
      de: "Wir haben deine Nachricht an {{formName}} erhalten",
    },
    body: {
      en: "Thank you. Your message to **{{formName}}** arrived on {{submittedAt}}.",
      de: "Vielen Dank. Deine Nachricht an **{{formName}}** ist am {{submittedAt}} eingegangen.",
    },
    allowedVariables: [...VARIABLES.submission_confirmation],
  },
};

const keyOf = (kind: MailTemplateKind) => `mail-template:${kind}`;
const pattern = /{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g;
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function substitute(source: string, allowed: readonly string[], values?: Record<string, string>): string {
  if (source.includes("{{") && !source.replace(pattern, "").includes("{{")) {
    return source.replace(pattern, (_match, name: string) => {
      if (!allowed.includes(name)) throw new Error(`Unknown mail template variable: ${name}`);
      if (!values) return `{{${name}}}`;
      if (!(name in values)) throw new Error(`Missing mail template value: ${name}`);
      return values[name] ?? "";
    });
  }
  if (source.includes("{{")) throw new Error("Invalid mail template variable syntax.");
  return source;
}

function children(node: Node): Node[] {
  const result: Node[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function renderInline(
  node: Node,
  source: string,
  allowed: readonly string[],
  values?: Record<string, string>,
): { html: string; text: string } {
  if (node.name === "Link") {
    const urlNode = children(node).find((child) => child.name === "URL");
    if (!urlNode) throw new Error("Mail links require a URL.");
    const url = substitute(source.slice(urlNode.from, urlNode.to), allowed, values);
    if (!/^https?:\/\//i.test(url)) throw new Error("Mail links require an HTTP or HTTPS URL.");
    const label = source.slice(
      node.from + 1,
      children(node).find((child) => child.name === "LinkMark" && child.from > node.from)?.from ?? node.to,
    );
    const text = substitute(label, allowed, values);
    return { html: `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`, text: `${text} (${url})` };
  }
  let html = "";
  let text = "";
  let cursor = node.from;
  for (const child of children(node)) {
    const before = substitute(source.slice(cursor, child.from), allowed, values);
    html += escapeHtml(before).replace(/\n/g, "<br>");
    text += before;
    if (!["EmphasisMark", "ListMark", "LinkMark", "URL"].includes(child.name)) {
      if (!["StrongEmphasis", "Emphasis", "Link"].includes(child.name))
        throw new Error(`Mail content does not support ${child.name}.`);
      const rendered = renderInline(child, source, allowed, values);
      html += rendered.html;
      text += rendered.text;
    }
    cursor = child.to;
  }
  const after = substitute(source.slice(cursor, node.to), allowed, values);
  html += escapeHtml(after).replace(/\n/g, "<br>");
  text += after;
  if (node.name === "StrongEmphasis") html = `<strong>${html}</strong>`;
  if (node.name === "Emphasis") html = `<em>${html}</em>`;
  return { html, text };
}

function renderBlock(
  node: Node,
  source: string,
  allowed: readonly string[],
  values?: Record<string, string>,
): { html: string; text: string } {
  if (node.name === "Paragraph") {
    const content = renderInline(node, source, allowed, values);
    return { html: `<p>${content.html}</p>`, text: content.text };
  }
  if (node.name === "BulletList" || node.name === "OrderedList") {
    const items = children(node).map((item, index) => {
      if (item.name !== "ListItem") throw new Error(`Mail content does not support ${item.name}.`);
      const paragraph = children(item).find((child) => child.name === "Paragraph");
      if (!paragraph) throw new Error("Mail list items need text.");
      const content = renderInline(paragraph, source, allowed, values);
      return {
        html: `<li>${content.html}</li>`,
        text: `${node.name === "BulletList" ? "-" : `${index + 1}.`} ${content.text}`,
      };
    });
    const tag = node.name === "BulletList" ? "ul" : "ol";
    return {
      html: `<${tag}>${items.map((item) => item.html).join("")}</${tag}>`,
      text: items.map((item) => item.text).join("\n"),
    };
  }
  throw new Error(`Mail content does not support ${node.name}.`);
}

/** Only paragraphs, emphasis, lists and HTTP links can enter email HTML. */
export function validateMailTemplate(template: MailTemplate): void {
  for (const language of ["en", "de"] as const) {
    substitute(template.subject[language], VARIABLES[template.kind]);
    substitute(template.body[language], VARIABLES[template.kind]);
    const source = template.body[language];
    const tree = parseContent(source);
    for (const block of children(tree.topNode)) renderBlock(block, source, VARIABLES[template.kind]);
  }
}

export function renderMailTemplate(
  template: MailTemplate,
  language: Language,
  values: Record<string, string>,
): RenderedMail {
  validateMailTemplate(template);
  const allowed = VARIABLES[template.kind];
  const source = template.body[language];
  const blocks = children(parseContent(source).topNode).map((block) =>
    renderBlock(block, source, allowed, values),
  );
  const subject = substitute(template.subject[language], allowed, values).replace(/[\r\n]/g, " ");
  return {
    subject,
    text: blocks.map((block) => block.text).join("\n\n"),
    html: `<div lang="${language}">${blocks.map((block) => block.html).join("")}</div>`,
  };
}

export async function readMailTemplate(db: Database, kind: MailTemplateKind): Promise<MailTemplate> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, keyOf(kind)))
    .limit(1);
  const parsed = saveMailTemplateBody.safeParse(row?.value);
  const template = parsed.success
    ? { ...parsed.data, kind, allowedVariables: [...VARIABLES[kind]] }
    : DEFAULT_MAIL_TEMPLATES[kind];
  validateMailTemplate(template);
  return template;
}

export async function listMailTemplates(db: Database): Promise<MailTemplate[]> {
  return Promise.all(
    (Object.keys(DEFAULT_MAIL_TEMPLATES) as MailTemplateKind[]).map((kind) => readMailTemplate(db, kind)),
  );
}

export async function saveMailTemplate(
  db: Database,
  kind: MailTemplateKind,
  value: SaveMailTemplateBody,
  actorUserId: string,
): Promise<MailTemplate> {
  const template = { ...value, kind, allowedVariables: [...VARIABLES[kind]] };
  validateMailTemplate(template);
  await db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({ key: keyOf(kind), value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
    await tx
      .insert(auditLog)
      .values({ actorUserId, action: "mail_template.updated", subjectType: "settings", detail: { kind } });
  });
  return template;
}

export function mailTemplateDraft(kind: MailTemplateKind, value: SaveMailTemplateBody): MailTemplate {
  return { ...value, kind, allowedVariables: [...VARIABLES[kind]] };
}
