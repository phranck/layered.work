import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning";
import { WarningOctagonIcon } from "@phosphor-icons/react/dist/ssr/WarningOctagon";
import type { ComponentPropsWithoutRef } from "react";
import type { ContentProps } from "./content-shared.js";

const icons = { info: InfoIcon, success: CheckCircleIcon, warning: WarningIcon, danger: WarningOctagonIcon };
function NoteBody(props: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className="content-note__body" />;
}
function NoteTitle(props: ComponentPropsWithoutRef<"strong">) {
  return <strong {...props} className="content-note__title" />;
}
function NoteRoot({ children, title, tone = "info" }: ContentProps<"Note">) {
  const Icon = icons[tone as keyof typeof icons] ?? InfoIcon;
  return (
    <aside className="content-note" data-tone={tone}>
      <Icon className="content-note__icon" weight="duotone" aria-hidden="true" />
      <NoteBody>
        {title && <NoteTitle>{title}</NoteTitle>}
        {children}
      </NoteBody>
    </aside>
  );
}
/** A status note with composable title and body; the icon also conveys tone. */
export const Note = Object.assign(NoteRoot, { Title: NoteTitle, Body: NoteBody });
