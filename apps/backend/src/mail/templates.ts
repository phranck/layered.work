import { NODE, parseContent } from "@layered/content";
import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  MAIL_LINK,
  MAIL_PLACEHOLDER_NAME_SOURCE,
  type MailTemplate,
  type MailTemplateKind,
  type RenderedMail,
  type SaveMailTemplateBody,
  saveMailTemplateBody,
} from "@layered/schemas";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { auditLog, settings } from "../db/schema/index.js";
import { escapeMarkup } from "../markup.js";

type Node = ReturnType<typeof parseContent>["topNode"];

/** The placeholders each template may use, which are the values its sender fills in. */
const VARIABLES = {
  submission_notification: ["formName", "submittedAt", "fields", "consents"],
  submission_confirmation: ["formName", "submittedAt"],
} as const satisfies Record<MailTemplateKind, readonly string[]>;

/**
 * The values a template of one kind is rendered with, one for each placeholder
 * it may use, so a sender or a preview that misses one fails to compile.
 */
export type MailTemplateValues<Kind extends MailTemplateKind> = Record<
  (typeof VARIABLES)[Kind][number],
  string
>;

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

/**
 * The type a mail states for itself, on the element around its body.
 *
 * Without it every mail client draws the message in its own default face, a
 * serif in some of them, and the dashboard's preview cannot show what arrives.
 * It is inline, because a mail carries no stylesheet, and its faces are the ones
 * the common systems ship.
 */
const MAIL_TYPE =
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.55; color: #1f2328;";
const pattern = new RegExp(`{{\\s*(${MAIL_PLACEHOLDER_NAME_SOURCE})\\s*}}`, "g");

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
    if (!MAIL_LINK.test(url)) throw new Error("Mail links require an HTTP or HTTPS URL.");
    const label = source.slice(
      node.from + 1,
      children(node).find((child) => child.name === "LinkMark" && child.from > node.from)?.from ?? node.to,
    );
    const text = substitute(label, allowed, values);
    return { html: `<a href="${escapeMarkup(url)}">${escapeMarkup(text)}</a>`, text: `${text} (${url})` };
  }
  let html = "";
  let text = "";
  let cursor = node.from;
  for (const child of children(node)) {
    // The mail profile reads a placeholder such as `{{formName}}` as a node of
    // its own. It stays in the text, and `substitute` fills it in.
    if (child.name === NODE.ValueReference) continue;
    const before = substitute(source.slice(cursor, child.from), allowed, values);
    html += escapeMarkup(before).replace(/\n/g, "<br>");
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
  html += escapeMarkup(after).replace(/\n/g, "<br>");
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
      return renderListItem(
        item,
        node.name === "BulletList" ? "-" : `${index + 1}.`,
        source,
        allowed,
        values,
      );
    });
    const tag = node.name === "BulletList" ? "ul" : "ol";
    return {
      html: `<${tag}>${items.map((item) => item.html).join("")}</${tag}>`,
      text: items.map((item) => item.text).join("\n"),
    };
  }
  throw new Error(`Mail content does not support ${node.name}.`);
}

/**
 * One item of a list, with everything it holds: its line, a paragraph that
 * continues it, and a list nested under it. The mail profile admits all three,
 * so the mail draws all three rather than its first line alone.
 *
 * In the plain text a nested line is indented under the item's marker, which is
 * how a list reads without markup.
 */
function renderListItem(
  item: Node,
  marker: string,
  source: string,
  allowed: readonly string[],
  values?: Record<string, string>,
): { html: string; text: string } {
  let html = "";
  const lines: string[] = [];
  for (const child of children(item)) {
    if (child.name === "ListMark") continue;
    if (child.name === "Paragraph") {
      const content = renderInline(child, source, allowed, values);
      html += html ? `<br>${content.html}` : content.html;
      lines.push(content.text);
    } else {
      const block = renderBlock(child, source, allowed, values);
      html += block.html;
      lines.push(block.text);
    }
  }
  if (lines.length === 0) throw new Error("Mail list items need text.");
  return { html: `<li>${html}</li>`, text: `${marker} ${lines.join("\n").replace(/\n/g, "\n  ")}` };
}

/** Only paragraphs, emphasis, lists and HTTP links can enter email HTML. */
export function validateMailTemplate(template: MailTemplate): void {
  for (const language of CONTENT_LANGUAGES) {
    substitute(template.subject[language], VARIABLES[template.kind]);
    substitute(template.body[language], VARIABLES[template.kind]);
    const source = template.body[language];
    const tree = parseContent(source, "mail");
    for (const block of children(tree.topNode)) renderBlock(block, source, VARIABLES[template.kind]);
  }
}

export function renderMailTemplate(
  template: MailTemplate,
  language: ContentLanguage,
  values: Record<string, string>,
): RenderedMail {
  validateMailTemplate(template);
  const allowed = VARIABLES[template.kind];
  const source = template.body[language];
  const blocks = children(parseContent(source, "mail").topNode).map((block) =>
    renderBlock(block, source, allowed, values),
  );
  const subject = substitute(template.subject[language], allowed, values).replace(/[\r\n]/g, " ");
  return {
    subject,
    text: blocks.map((block) => block.text).join("\n\n"),
    html: `<div lang="${language}" style="${MAIL_TYPE}">${blocks.map((block) => block.html).join("")}</div>`,
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
