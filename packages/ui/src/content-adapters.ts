import type { ComponentName, ComponentNode, PropsOf } from "@layered/content";
import { createElement, type ReactNode } from "react";
import { ContentButton, ContentCard } from "./content-controls.js";
import type { ContentProps, ContentUrlResolver, MediaResolver } from "./content-shared.js";
import { Divider } from "./divider.js";
import { Document } from "./document.js";
import { Figure } from "./figure.js";
import { FormEmbed, type FormEmbedProps } from "./form-embed.js";
import { Gallery } from "./gallery.js";
import { Grid } from "./grid.js";
import { Model } from "./model.js";
import { Note } from "./note.js";
import { Spacer } from "./spacer.js";
import { Stack } from "./stack.js";
import { Video } from "./video.js";
import { YouTube } from "./youtube.js";

type Adapter = (
  node: ComponentNode,
  media: MediaResolver,
  children: ReactNode,
  forms?: Readonly<Record<string, FormEmbedProps>>,
  resolveUrl?: ContentUrlResolver,
) => ReactNode;
function props<N extends ComponentName>(node: ComponentNode, children: ReactNode): ContentProps<N> {
  // The content package owns interpretation/defaults. Only the neutral body is
  // replaced here, at the boundary where it becomes React.
  return { ...node.props, children } as ContentProps<N>;
}
/** The complete adapter table, checked against the register by the parity test. */
export const CONTENT_RENDERERS: Readonly<Record<string, Adapter>> = {
  Stack: (node, _media, children) =>
    createElement(Stack, {
      ...props<"HStack">(node, children),
      direction: node.name === "HStack" ? "horizontal" : "vertical",
    }),
  Grid: (node, _media, children) => createElement(Grid, props<"Grid">(node, children)),
  Spacer: (node) => createElement(Spacer, node.props),
  Divider: () => createElement(Divider),
  Form: (node, _media, _children, forms) => {
    const name = node.props.name;
    const found = typeof name === "string" ? forms?.[name] : undefined;
    return found
      ? createElement(FormEmbed, found)
      : createElement("p", { className: "form-embed", role: "status" }, "Form unavailable.");
  },
  Figure: (node, media) => createElement(Figure, { ...(node.props as unknown as PropsOf<"Image">), media }),
  Gallery: (node, _media, children) => createElement(Gallery, props<"Gallery">(node, children)),
  Model: (node, media) => createElement(Model, { ...(node.props as unknown as PropsOf<"Model">), media }),
  Video: (node, media) => createElement(Video, { ...(node.props as unknown as PropsOf<"Video">), media }),
  YouTube: (node) => createElement(YouTube, node.props as unknown as PropsOf<"YouTube">),
  Document: (node, media) => createElement(Document, { ...(node.props as unknown as PropsOf<"Pdf">), media }),
  Note: (node, _media, children) => createElement(Note, props<"Note">(node, children)),
  Button: (node, _media, children, _forms, resolveUrl) =>
    createElement(ContentButton, { ...props<"Button">(node, children), resolveUrl }),
  Card: (node, media, children, _forms, resolveUrl) =>
    createElement(ContentCard, { ...props<"Card">(node, children), media, resolveUrl }),
};
