/**
 * Interface icons use Phosphor components, never hand-written SVG paths.
 * Explicit submodule exports avoid loading the entire catalogue in development.
 * The SSR variants also work in the browser and default to 1em/currentColor,
 * so Row.Lead supplies the sidebar and content icon sizes from its tokens.
 */

export type { IconProps, IconWeight } from "@phosphor-icons/react";
export { ArticleIcon } from "@phosphor-icons/react/dist/ssr/Article";
export { ChartLineIcon } from "@phosphor-icons/react/dist/ssr/ChartLine";
export { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
export { FilesIcon } from "@phosphor-icons/react/dist/ssr/Files";
export { FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr/FloppyDisk";
export { GearIcon } from "@phosphor-icons/react/dist/ssr/Gear";
export { ImagesIcon } from "@phosphor-icons/react/dist/ssr/Images";
export { ListIcon } from "@phosphor-icons/react/dist/ssr/List";
export { ListDashesIcon } from "@phosphor-icons/react/dist/ssr/ListDashes";
export { LockKeyIcon } from "@phosphor-icons/react/dist/ssr/LockKey";
export { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
export { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
export { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
export { ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
export { SignInIcon } from "@phosphor-icons/react/dist/ssr/SignIn";
export { SignOutIcon } from "@phosphor-icons/react/dist/ssr/SignOut";
export { SquaresFourIcon } from "@phosphor-icons/react/dist/ssr/SquaresFour";
export { StackSimpleIcon } from "@phosphor-icons/react/dist/ssr/StackSimple";
export { TagIcon } from "@phosphor-icons/react/dist/ssr/Tag";
export { TextboxIcon } from "@phosphor-icons/react/dist/ssr/Textbox";
export { TrayIcon } from "@phosphor-icons/react/dist/ssr/Tray";
export { UserCircleIcon } from "@phosphor-icons/react/dist/ssr/UserCircle";
export { XIcon } from "@phosphor-icons/react/dist/ssr/X";
