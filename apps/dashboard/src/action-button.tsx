import { Button, type ButtonIconProps, type ButtonLinkProps, type ButtonProps } from "@layered/ui";
import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowsMergeIcon,
  ArrowUpIcon,
  CameraIcon,
  CaretLeftIcon,
  CaretRightIcon,
  DotsSixVerticalIcon,
  DownloadSimpleIcon,
  EnvelopeOpenIcon,
  EnvelopeSimpleIcon,
  EyeIcon,
  FloppyDiskIcon,
  GearIcon,
  GlobeIcon,
  type IconProps,
  ImagesIcon,
  KeyIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  SignInIcon,
  SignOutIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningOctagonIcon,
  XIcon,
} from "@layered/ui/icons";
import type { ComponentType } from "react";

/**
 * The icon of every action the dashboard offers, stated once, so saving looks
 * the same on every screen and nobody chooses an icon again at a call site.
 * Keyed by what the action does rather than by what its button says, because
 * "Save" and "Saving…" are the same action.
 */
export const ACTION_ICONS = {
  new: PlusIcon,
  save: FloppyDiskIcon,
  cancel: XIcon,
  edit: PencilSimpleIcon,
  delete: TrashIcon,
  remove: TrashIcon,
  discard: TrashIcon,
  close: XIcon,
  back: ArrowLeftIcon,
  move: DotsSixVerticalIcon,
  restore: ArrowCounterClockwiseIcon,
  publish: GlobeIcon,
  preview: EyeIcon,
  merge: ArrowsMergeIcon,
  upload: UploadSimpleIcon,
  choosePicture: ImagesIcon,
  unsplash: CameraIcon,
  send: PaperPlaneTiltIcon,
  download: DownloadSimpleIcon,
  issueToken: KeyIcon,
  markRead: EnvelopeOpenIcon,
  markUnread: EnvelopeSimpleIcon,
  markSpam: WarningOctagonIcon,
  settings: GearIcon,
  moveUp: ArrowUpIcon,
  moveDown: ArrowDownIcon,
  previousPage: CaretLeftIcon,
  nextPage: CaretRightIcon,
  signIn: SignInIcon,
  signOut: SignOutIcon,
} as const satisfies Record<string, ComponentType<IconProps>>;

/** One of the dashboard's actions. */
export type Action = keyof typeof ACTION_ICONS;

/**
 * The actions that remove or destroy something. Their buttons take the danger
 * tone wherever they stand, as a labeled button and as an icon alone.
 */
const DESTRUCTIVE: ReadonlySet<Action> = new Set(["delete", "remove", "discard"]);

/** Props for a labeled button of one action. */
export interface ActionButtonProps extends Omit<ButtonProps, "icon" | "tone"> {
  action: Action;
  /** Defaults to danger for an action that destroys something, and to secondary otherwise. */
  tone?: ButtonProps["tone"];
}

/**
 * A labeled button of one of the dashboard's actions, with the action's icon
 * before the label.
 */
function ActionButtonRoot({ action, tone, ...props }: ActionButtonProps) {
  const Icon = ACTION_ICONS[action];
  return (
    <Button tone={tone ?? (DESTRUCTIVE.has(action) ? "danger" : "secondary")} icon={<Icon />} {...props} />
  );
}

/** Props for an icon-only button of one action. */
export interface ActionIconProps extends Omit<ButtonIconProps, "icon" | "tone"> {
  action: Action;
}

/**
 * An icon-only button of one of the dashboard's actions, such as the pencil at
 * the end of a row. Its label is what a screen reader announces and what the
 * tooltip shows.
 */
function ActionIcon({ action, ...props }: ActionIconProps) {
  const Icon = ACTION_ICONS[action];
  return <Button.Icon icon={<Icon />} tone={DESTRUCTIVE.has(action) ? "danger" : undefined} {...props} />;
}

/** Props for a link that looks like the button of one action. */
export interface ActionLinkProps extends Omit<ButtonLinkProps, "icon"> {
  action: Action;
}

/**
 * A link drawn as the button of one of the dashboard's actions, for an action
 * the browser carries out itself, such as a download.
 */
function ActionLink({ action, ...props }: ActionLinkProps) {
  const Icon = ACTION_ICONS[action];
  return <Button.Link icon={<Icon />} {...props} />;
}

/** A button of one of the dashboard's actions: labeled, as an icon alone, or as a link. */
export const ActionButton = Object.assign(ActionButtonRoot, { Icon: ActionIcon, Link: ActionLink });
