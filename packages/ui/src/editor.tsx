import { type ComponentPropsWithoutRef, Fragment, forwardRef, type ReactNode } from "react";
import { Card } from "./card.js";
import { type DivProps, join } from "./shared.js";

/** Props for an editor toolbar. */
export interface EditorToolbarProps extends DivProps {
  groups: readonly (readonly ReactNode[])[];
}
/** Props for an editor tool. */
export interface EditorToolProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  label: string;
  icon?: ReactNode;
}
/** Props for editor actions. */
export interface EditorActionsProps extends DivProps {
  destructive?: ReactNode;
}
/** Props for an editor side panel. */
export interface EditorPanelProps extends Omit<DivProps, "title"> {
  eyebrow?: ReactNode;
  title: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
}
/** The editor layout container. */
const EditorRoot = forwardRef<HTMLElement, ComponentPropsWithoutRef<"section">>(
  ({ className, ...props }, ref) => <section ref={ref} className={join("editor", className)} {...props} />,
);
/** The main editor column. */
const EditorMain = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("editor__main", className)} {...props} />
));
/** The grouped editor toolbar. */
const EditorToolbar = forwardRef<HTMLDivElement, EditorToolbarProps>(
  ({ children, className, groups, ...props }, ref) => (
    <div ref={ref} className={join("editor__toolbar", className)} {...props}>
      {groups.map((group, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Toolbar group order defines divider identity and groups hold no component state.
        <Fragment key={index}>
          {index > 0 && <span className="editor__divider" />}
          {group}
        </Fragment>
      ))}
      {children}
    </div>
  ),
);
/** A toolbar action. */
const EditorTool = forwardRef<HTMLButtonElement, EditorToolProps>(
  ({ className, icon, label, title = icon ? label : undefined, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      className={join("editor__tool", !icon && "editor__tool--text", className)}
      type={type}
      aria-label={icon ? label : undefined}
      title={title}
      {...props}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : label}
    </button>
  ),
);
/** The editable content surface. */
const EditorSurface = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("editor__surface", className)} {...props} />
));
/** Actions beneath the editing surface. */
const EditorActions = forwardRef<HTMLDivElement, EditorActionsProps>(
  ({ children, className, destructive, ...props }, ref) => (
    <div ref={ref} className={join("actions", className)} {...props}>
      {destructive && <span className="actions__aside">{destructive}</span>}
      {children}
    </div>
  ),
);
/** The editor properties panel. */
const EditorPanel = forwardRef<HTMLDivElement, EditorPanelProps>(
  ({ actions, children, className, eyebrow, note, title, ...props }, ref) => (
    <div ref={ref} className={join("editor__panel", className)} {...props}>
      <Card>
        <Card.Header eyebrow={eyebrow} title={title} />
        <Card.Stack>{children}</Card.Stack>
        {(note || actions) && <Card.Footer note={note} actions={actions} />}
      </Card>
    </div>
  ),
);
/** A main editing surface with a property panel. */
export const Editor = Object.assign(EditorRoot, {
  Main: EditorMain,
  Toolbar: EditorToolbar,
  Tool: EditorTool,
  Surface: EditorSurface,
  Actions: EditorActions,
  Panel: EditorPanel,
});
