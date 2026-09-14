import { SPACE_STEPS, STATUS_TONES } from "@layered/tokens";
import type { Register } from "./kinds.js";

/**
 * Every component an author may write, and everything anything else needs to
 * know about it.
 *
 * **This is the only place a component is described.** The parser reads it to
 * know what a name means, the validator reads it to know what is permitted, the
 * renderer reads it to know what to build, and the editor reads it for its
 * completion list and its highlighting. Adding a component here is the whole of
 * adding a component.
 *
 * **Values come from the token system.** `spacing` takes the steps of the space
 * scale and `tone` takes the status colours, both imported rather than typed
 * out, so a step added to a stylesheet is offered to authors with nothing else
 * edited. That is the line between composing and restyling: an author says
 * which step, never how many pixels.
 */

/**
 * The ends of the space scale.
 *
 * Every sentence about the scale, here and in the validator, is built from
 * these rather than from a number somebody typed, so a step added to the
 * stylesheet cannot leave one of them claiming otherwise.
 */
export const SPACE_STEP_RANGE = {
  first: SPACE_STEPS[0],
  last: SPACE_STEPS[SPACE_STEPS.length - 1] ?? SPACE_STEPS[0],
} as const;

/** The steps, as the language writes them: bare numbers. */
const SPACING = {
  kind: "step",
  description: `A step of the space scale, from ${SPACE_STEP_RANGE.first} to ${SPACE_STEP_RANGE.last}.`,
  // A name rather than a number, the same as every other step: `var(--space-5)`
  // wants the 5 as a name, and a default written differently from the values it
  // stands among is a difference a renderer would have to know about.
  default: "5",
} as const;

/** What a stack does with children that are not all the same size. */
const CROSS_ALIGN = ["leading", "center", "trailing", "stretch"] as const;

export const components = {
  VStack: {
    description: "Stacks its contents vertically.",
    body: "required",
    parameters: {
      spacing: SPACING,
      align: {
        kind: "keyword",
        description: "How contents line up across the stack.",
        values: CROSS_ALIGN,
        default: "stretch",
      },
    },
    renders: "Stack",
  },

  HStack: {
    description: "Places its contents side by side.",
    body: "required",
    parameters: {
      spacing: SPACING,
      align: {
        kind: "keyword",
        description: "How contents line up against each other.",
        values: ["top", "center", "bottom", "stretch"],
        default: "stretch",
      },
      wrap: {
        kind: "flag",
        description: "Whether contents move onto a second line when there is no room.",
        default: true,
      },
    },
    renders: "Stack",
  },

  Grid: {
    description: "Arranges its contents in columns of equal width.",
    body: "required",
    parameters: {
      columns: {
        kind: "number",
        description: "How many columns at the widest. Fewer on a narrow screen.",
        range: [1, 6],
        default: 2,
      },
      spacing: SPACING,
    },
    renders: "Grid",
  },

  Spacer: {
    description: "Pushes what follows away from what came before.",
    body: "never",
    unnamed: "size",
    parameters: {
      size: {
        kind: "step",
        description: "A fixed step of space. Without one it takes whatever room is going.",
      },
    },
    renders: "Spacer",
  },

  Divider: {
    description: "A line between two parts of a page.",
    body: "never",
    parameters: {},
    renders: "Divider",
  },

  Image: {
    description: "A picture from the media library.",
    body: "never",
    unnamed: "slug",
    parameters: {
      slug: {
        kind: "slug",
        description: "The name of the picture in the media library.",
        required: true,
      },
      caption: {
        kind: "text",
        description: "Shown beneath it. The library's own caption is used when this is absent.",
      },
      alt: {
        kind: "text",
        description:
          "What a screen reader says. The library's own, in this language, is used when this is absent.",
      },
    },
    renders: "Figure",
  },

  Gallery: {
    description: "Several pictures together, shown as a set.",
    body: "required",
    parameters: {
      columns: {
        kind: "number",
        description: "How many across at the widest.",
        range: [1, 6],
        default: 3,
      },
      spacing: SPACING,
    },
    renders: "Gallery",
  },

  Model: {
    description: "A three-dimensional model that can be turned.",
    body: "never",
    unnamed: "slug",
    parameters: {
      slug: {
        kind: "slug",
        description: "The name of the model in the media library.",
        required: true,
      },
      alt: {
        kind: "text",
        description: "What a screen reader says, since a model cannot be described by looking at it.",
      },
      caption: { kind: "text", description: "Shown beneath it." },
    },
    renders: "Model",
  },

  Video: {
    description: "A video from the media library.",
    body: "never",
    unnamed: "slug",
    parameters: {
      slug: { kind: "slug", description: "The name of the video in the media library.", required: true },
      poster: { kind: "slug", description: "A picture to show before it plays." },
      caption: { kind: "text", description: "Shown beneath it." },
    },
    renders: "Video",
  },

  Pdf: {
    description: "A document to read or download.",
    body: "never",
    unnamed: "slug",
    parameters: {
      slug: { kind: "slug", description: "The name of the document in the media library.", required: true },
      label: { kind: "text", description: "What the link says. The file's own name otherwise." },
    },
    renders: "Document",
  },

  Note: {
    description: "Something set apart from the text around it.",
    body: "required",
    parameters: {
      tone: {
        kind: "keyword",
        description: "What kind of thing it is.",
        values: STATUS_TONES,
        default: "info",
      },
      title: { kind: "text", description: "A heading for the note." },
    },
    renders: "Note",
  },

  Button: {
    description: "A link that looks like something to press.",
    body: "never",
    unnamed: "label",
    parameters: {
      label: { kind: "text", description: "What it says.", required: true },
      href: { kind: "text", description: "Where it goes.", required: true },
      icon: { kind: "icon", description: "A mark before the label." },
      tone: {
        kind: "keyword",
        description: "How much it asks to be pressed.",
        // Not the status colours: these say how important a control is, not
        // what state something is in. The two sets meet at `danger` and mean
        // the same thing there.
        values: ["primary", "secondary", "danger"],
        default: "secondary",
      },
    },
    renders: "Button",
  },

  Card: {
    description: "A piece of content standing on its own, with a border around it.",
    body: "required",
    parameters: {
      title: { kind: "text", description: "A heading for the card." },
      href: { kind: "text", description: "Where the whole card leads, if anywhere." },
      image: { kind: "slug", description: "A picture across the top." },
    },
    renders: "Card",
  },
} as const satisfies Register;

/** Every component name, as a type. */
export type ComponentName = keyof typeof components;

/** Every component name, as a list, in the order the register declares them. */
export const COMPONENT_NAMES = Object.keys(components) as ComponentName[];

/**
 * The steps the language accepts wherever a space is asked for.
 *
 * Re-exported so that nothing reading this register has to know which package
 * the scale came from, and so the parser can check a bare number against it
 * without importing a stylesheet's business.
 */
export { SPACE_STEPS };
