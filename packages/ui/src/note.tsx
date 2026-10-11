import type { ComponentPropsWithoutRef } from "react";
import type { ContentProps } from "./content-shared.js";
import { TONE_ICONS } from "./icons.js";

function NoteBody(props: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className="content-note__body" />;
}
function NoteTitle(props: ComponentPropsWithoutRef<"strong">) {
  return <strong {...props} className="content-note__title" />;
}
function NoteRoot({ children, title, tone = "info" }: ContentProps<"Note">) {
  const Icon = TONE_ICONS[tone as keyof typeof TONE_ICONS] ?? TONE_ICONS.info;
  return (
    <aside className="content-note" data-tone={tone}>
      <Icon className="content-note__icon" aria-hidden="true" />
      <NoteBody>
        {title && <NoteTitle>{title}</NoteTitle>}
        {children}
      </NoteBody>
    </aside>
  );
}
/** A status note with composable title and body; the icon also conveys tone. */
export const Note = Object.assign(NoteRoot, { Title: NoteTitle, Body: NoteBody });
