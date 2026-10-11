import type { SyntaxNode } from "@lezer/common";

/**
 * Which part of the content language a text may be written in.
 *
 * - `entry`: the whole language, for an entry's body and a listing's
 *   introduction, which stand on a page of their own.
 * - `mail`: what a mail carries: paragraphs, lists, emphasis, strong emphasis,
 *   links and the template's placeholders. Nothing else survives a mail client.
 * - `inline`: a line of text with emphasis, strong emphasis and links, for a
 *   caption, a consent notice, a form's message or a lede, which stand inside a
 *   place the size of a sentence.
 *
 * The editor, the validator and the renderer read the same profile, so what the
 * editor accepts is exactly what the page draws.
 */
export type ContentProfile = "entry" | "mail" | "inline";

/** Every profile, in the order the list above names them. */
export const CONTENT_PROFILES = ["entry", "mail", "inline"] as const satisfies readonly ContentProfile[];

/**
 * A bare address written in running text, told apart from the address inside a
 * link, which has the same node type.
 */
const BARE_ADDRESS = "BareURL";

/** The node types of the tree a profile narrower than the whole language admits. */
const ADMITTED: Record<Exclude<ContentProfile, "entry">, ReadonlySet<string>> = {
  mail: new Set([
    "Document",
    "Paragraph",
    "BulletList",
    "OrderedList",
    "ListItem",
    "ListMark",
    "Emphasis",
    "StrongEmphasis",
    "EmphasisMark",
    "Link",
    "LinkMark",
    "URL",
    "ValueReference",
    "ValueName",
  ]),
  inline: new Set([
    "Document",
    "Paragraph",
    "Emphasis",
    "StrongEmphasis",
    "EmphasisMark",
    "Link",
    "LinkMark",
    "URL",
    BARE_ADDRESS,
    "Escape",
    "Entity",
    "HardBreak",
  ]),
};

/**
 * What an author wrote, named so a refusal can say it in their words rather
 * than in a node type of the parser. `markup` is anything the parser knows
 * that no profile narrower than the whole language has a name for.
 */
export type Construct =
  | "heading"
  | "quote"
  | "list"
  | "task"
  | "code"
  | "table"
  | "image"
  | "html"
  | "rule"
  | "strikethrough"
  | "value"
  | "address"
  | "escape"
  | "entity"
  | "break"
  | "reference"
  | "markup";

/** The construct each node type a profile can refuse is. */
const CONSTRUCTS: Readonly<Record<string, Construct>> = {
  ATXHeading1: "heading",
  ATXHeading2: "heading",
  ATXHeading3: "heading",
  ATXHeading4: "heading",
  ATXHeading5: "heading",
  ATXHeading6: "heading",
  SetextHeading1: "heading",
  SetextHeading2: "heading",
  Blockquote: "quote",
  BulletList: "list",
  OrderedList: "list",
  Task: "task",
  FencedCode: "code",
  CodeBlock: "code",
  InlineCode: "code",
  Table: "table",
  Image: "image",
  HTMLBlock: "html",
  HTMLTag: "html",
  Comment: "html",
  ProcessingInstruction: "html",
  HorizontalRule: "rule",
  Strikethrough: "strikethrough",
  ValueReference: "value",
  [BARE_ADDRESS]: "address",
  Escape: "escape",
  Entity: "entity",
  HardBreak: "break",
  LinkReference: "reference",
};

/** The construct a node type is, for a node type the table above does not name. */
const OTHER_CONSTRUCT: Construct = "markup";

/**
 * The construct a node is, if a profile does not admit it.
 *
 * Asked of every node on the way down a tree; a refused node's children are not
 * asked, because the construct they belong to has already been refused.
 *
 * @param profile - The profile the text is written in.
 * @param node - A node of the text's tree.
 * @returns The construct, such as `heading`, or nothing where the node is admitted.
 */
export function refusedConstruct(profile: ContentProfile, node: SyntaxNode): Construct | undefined {
  if (profile === "entry") return undefined;
  const type = node.name === "URL" && node.parent?.name !== "Link" ? BARE_ADDRESS : node.name;
  if (ADMITTED[profile].has(type)) return undefined;
  return CONSTRUCTS[type] ?? OTHER_CONSTRUCT;
}

/** What each construct a profile can refuse is called in English, as the start of a sentence. */
export const CONSTRUCT_TEXT: Readonly<Record<Construct, string>> = {
  heading: "A heading",
  quote: "A quote",
  list: "A list",
  task: "A task",
  code: "Code",
  table: "A table",
  image: "A picture",
  html: "HTML",
  rule: "A rule",
  strikethrough: "Strikethrough",
  value: "A named value",
  address: "An address outside a link",
  escape: "An escape",
  entity: "An entity",
  break: "A line break",
  reference: "A link definition",
  markup: "This markup",
};
