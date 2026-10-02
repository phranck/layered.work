/**
 * Interface icons use Phosphor components, never hand-written SVG paths.
 * Explicit submodule exports avoid loading the entire catalogue in development.
 * The SSR variants also work in the browser and default to 1em/currentColor,
 * so Row.Lead supplies the sidebar and content icon sizes from its tokens.
 */

export type { IconProps, IconWeight } from "@phosphor-icons/react";
export { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
export { ArticleIcon } from "@phosphor-icons/react/dist/ssr/Article";
export { ChartLineIcon } from "@phosphor-icons/react/dist/ssr/ChartLine";
export { CodeIcon } from "@phosphor-icons/react/dist/ssr/Code";
export { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/ssr/DotsSixVertical";
export { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
export { FilesIcon } from "@phosphor-icons/react/dist/ssr/Files";
export { FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr/FloppyDisk";
export { GearIcon } from "@phosphor-icons/react/dist/ssr/Gear";
export { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
export { ImagesIcon } from "@phosphor-icons/react/dist/ssr/Images";
export { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
export { ListIcon } from "@phosphor-icons/react/dist/ssr/List";
export { ListBulletsIcon } from "@phosphor-icons/react/dist/ssr/ListBullets";
export { ListDashesIcon } from "@phosphor-icons/react/dist/ssr/ListDashes";
export { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
export { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
export { PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr/PencilSimple";
export { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
export { QuotesIcon } from "@phosphor-icons/react/dist/ssr/Quotes";
export { ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
export { SignInIcon } from "@phosphor-icons/react/dist/ssr/SignIn";
export { SignOutIcon } from "@phosphor-icons/react/dist/ssr/SignOut";
export { SquaresFourIcon } from "@phosphor-icons/react/dist/ssr/SquaresFour";
export { StackSimpleIcon } from "@phosphor-icons/react/dist/ssr/StackSimple";
export { StarIcon } from "@phosphor-icons/react/dist/ssr/Star";
export { TagIcon } from "@phosphor-icons/react/dist/ssr/Tag";
export { TextBIcon } from "@phosphor-icons/react/dist/ssr/TextB";
export { TextboxIcon } from "@phosphor-icons/react/dist/ssr/Textbox";
export { TextHTwoIcon } from "@phosphor-icons/react/dist/ssr/TextHTwo";
export { TextItalicIcon } from "@phosphor-icons/react/dist/ssr/TextItalic";
export { TrayIcon } from "@phosphor-icons/react/dist/ssr/Tray";
export { UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr/UploadSimple";
export { UserCircleIcon } from "@phosphor-icons/react/dist/ssr/UserCircle";
export { WrenchIcon } from "@phosphor-icons/react/dist/ssr/Wrench";
export { XIcon } from "@phosphor-icons/react/dist/ssr/X";
