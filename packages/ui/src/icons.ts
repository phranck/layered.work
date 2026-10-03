/**
 * Interface icons use Phosphor components, never hand-written SVG paths.
 * Explicit submodule exports avoid loading the entire catalogue in development.
 * The SSR variants also work in the browser and default to 1em/currentColor,
 * so Row.Lead supplies the sidebar and content icon sizes from its tokens.
 *
 * **Every icon is drawn in Phosphor's duotone weight, and no other.** Each one
 * is exported through `duotone`, which sets the weight itself and whose props
 * accept no other, so an icon in another weight is a type error rather than a
 * habit somebody has to remember. Decided by phranck on 2 October 2026.
 */

import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { ArrowsMergeIcon as ArrowsMerge } from "@phosphor-icons/react/dist/ssr/ArrowsMerge";
import { ArrowsOutLineVerticalIcon as ArrowsOutLineVertical } from "@phosphor-icons/react/dist/ssr/ArrowsOutLineVertical";
import { ArticleIcon as Article } from "@phosphor-icons/react/dist/ssr/Article";
import { CardsIcon as Cards } from "@phosphor-icons/react/dist/ssr/Cards";
import { ChartLineIcon as ChartLine } from "@phosphor-icons/react/dist/ssr/ChartLine";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { CodeIcon as Code } from "@phosphor-icons/react/dist/ssr/Code";
import { ColumnsIcon as Columns } from "@phosphor-icons/react/dist/ssr/Columns";
import { CubeIcon as Cube } from "@phosphor-icons/react/dist/ssr/Cube";
import { CursorClickIcon as CursorClick } from "@phosphor-icons/react/dist/ssr/CursorClick";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/dist/ssr/DotsSixVertical";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { EyeIcon as Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { FilePdfIcon as FilePdf } from "@phosphor-icons/react/dist/ssr/FilePdf";
import { FilesIcon as Files } from "@phosphor-icons/react/dist/ssr/Files";
import { FloppyDiskIcon as FloppyDisk } from "@phosphor-icons/react/dist/ssr/FloppyDisk";
import { GearIcon as Gear } from "@phosphor-icons/react/dist/ssr/Gear";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/ssr/Globe";
import { GridFourIcon as GridFour } from "@phosphor-icons/react/dist/ssr/GridFour";
import { HouseIcon as House } from "@phosphor-icons/react/dist/ssr/House";
import { ImageIcon as Image } from "@phosphor-icons/react/dist/ssr/Image";
import { ImagesIcon as Images } from "@phosphor-icons/react/dist/ssr/Images";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/ssr/Info";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/ssr/Link";
import { ListIcon as List } from "@phosphor-icons/react/dist/ssr/List";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/dist/ssr/ListBullets";
import { ListDashesIcon as ListDashes } from "@phosphor-icons/react/dist/ssr/ListDashes";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MagnifyingGlassMinusIcon as MagnifyingGlassMinus } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassMinus";
import { MagnifyingGlassPlusIcon as MagnifyingGlassPlus } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassPlus";
import { MinusIcon as Minus } from "@phosphor-icons/react/dist/ssr/Minus";
import { NoteIcon as Note } from "@phosphor-icons/react/dist/ssr/Note";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { QuotesIcon as Quotes } from "@phosphor-icons/react/dist/ssr/Quotes";
import { RowsIcon as Rows } from "@phosphor-icons/react/dist/ssr/Rows";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
import { SignInIcon as SignIn } from "@phosphor-icons/react/dist/ssr/SignIn";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { StackSimpleIcon as StackSimple } from "@phosphor-icons/react/dist/ssr/StackSimple";
import { StarIcon as Star } from "@phosphor-icons/react/dist/ssr/Star";
import { TableIcon as Table } from "@phosphor-icons/react/dist/ssr/Table";
import { TagIcon as Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { TextBIcon as TextB } from "@phosphor-icons/react/dist/ssr/TextB";
import { TextboxIcon as Textbox } from "@phosphor-icons/react/dist/ssr/Textbox";
import { TextHTwoIcon as TextHTwo } from "@phosphor-icons/react/dist/ssr/TextHTwo";
import { TextItalicIcon as TextItalic } from "@phosphor-icons/react/dist/ssr/TextItalic";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { TrayIcon as Tray } from "@phosphor-icons/react/dist/ssr/Tray";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/dist/ssr/VideoCamera";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { WarningOctagonIcon as WarningOctagon } from "@phosphor-icons/react/dist/ssr/WarningOctagon";
import { WrenchIcon as Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";
import { XIcon as X } from "@phosphor-icons/react/dist/ssr/X";
import { type ComponentType, createElement, forwardRef } from "react";

/** What an interface icon takes: everything Phosphor does, with the weight fixed. */
export type IconProps = Omit<PhosphorIconProps, "weight"> & { weight?: "duotone" };

/**
 * One Phosphor icon, always in its duotone weight.
 *
 * @param Icon - The Phosphor component.
 * @param name - Its name, for the component tree.
 */
function duotone(Icon: ComponentType<PhosphorIconProps>, name: string) {
  const Duotone = forwardRef<SVGSVGElement, IconProps>((props, ref) =>
    createElement(Icon, { ...props, ref, weight: "duotone" } as PhosphorIconProps),
  );
  Duotone.displayName = name;
  return Duotone;
}

export const ArrowCounterClockwiseIcon = duotone(ArrowCounterClockwise, "ArrowCounterClockwiseIcon");
export const ArrowLeftIcon = duotone(ArrowLeft, "ArrowLeftIcon");
export const ArrowsOutLineVerticalIcon = duotone(ArrowsOutLineVertical, "ArrowsOutLineVerticalIcon");
export const ArrowsMergeIcon = duotone(ArrowsMerge, "ArrowsMergeIcon");
export const ArticleIcon = duotone(Article, "ArticleIcon");
export const CardsIcon = duotone(Cards, "CardsIcon");
export const CheckCircleIcon = duotone(CheckCircle, "CheckCircleIcon");
export const ChartLineIcon = duotone(ChartLine, "ChartLineIcon");
export const CodeIcon = duotone(Code, "CodeIcon");
export const ColumnsIcon = duotone(Columns, "ColumnsIcon");
export const CubeIcon = duotone(Cube, "CubeIcon");
export const CursorClickIcon = duotone(CursorClick, "CursorClickIcon");
export const DotsSixVerticalIcon = duotone(DotsSixVertical, "DotsSixVerticalIcon");
export const EnvelopeSimpleIcon = duotone(EnvelopeSimple, "EnvelopeSimpleIcon");
export const EyeIcon = duotone(Eye, "EyeIcon");
export const FilePdfIcon = duotone(FilePdf, "FilePdfIcon");
export const FilesIcon = duotone(Files, "FilesIcon");
export const FloppyDiskIcon = duotone(FloppyDisk, "FloppyDiskIcon");
export const GearIcon = duotone(Gear, "GearIcon");
export const GlobeIcon = duotone(Globe, "GlobeIcon");
export const GridFourIcon = duotone(GridFour, "GridFourIcon");
export const HouseIcon = duotone(House, "HouseIcon");
export const ImageIcon = duotone(Image, "ImageIcon");
export const ImagesIcon = duotone(Images, "ImagesIcon");
export const InfoIcon = duotone(Info, "InfoIcon");
export const LinkIcon = duotone(Link, "LinkIcon");
export const ListIcon = duotone(List, "ListIcon");
export const ListBulletsIcon = duotone(ListBullets, "ListBulletsIcon");
export const ListDashesIcon = duotone(ListDashes, "ListDashesIcon");
export const MagnifyingGlassIcon = duotone(MagnifyingGlass, "MagnifyingGlassIcon");
export const MagnifyingGlassMinusIcon = duotone(MagnifyingGlassMinus, "MagnifyingGlassMinusIcon");
export const MagnifyingGlassPlusIcon = duotone(MagnifyingGlassPlus, "MagnifyingGlassPlusIcon");
export const MinusIcon = duotone(Minus, "MinusIcon");
export const NoteIcon = duotone(Note, "NoteIcon");
export const PaperPlaneTiltIcon = duotone(PaperPlaneTilt, "PaperPlaneTiltIcon");
export const PencilSimpleIcon = duotone(PencilSimple, "PencilSimpleIcon");
export const PlusIcon = duotone(Plus, "PlusIcon");
export const QuotesIcon = duotone(Quotes, "QuotesIcon");
export const RowsIcon = duotone(Rows, "RowsIcon");
export const ShareNetworkIcon = duotone(ShareNetwork, "ShareNetworkIcon");
export const SignInIcon = duotone(SignIn, "SignInIcon");
export const SignOutIcon = duotone(SignOut, "SignOutIcon");
export const SquaresFourIcon = duotone(SquaresFour, "SquaresFourIcon");
export const StackSimpleIcon = duotone(StackSimple, "StackSimpleIcon");
export const StarIcon = duotone(Star, "StarIcon");
export const TableIcon = duotone(Table, "TableIcon");
export const TagIcon = duotone(Tag, "TagIcon");
export const TextBIcon = duotone(TextB, "TextBIcon");
export const TextboxIcon = duotone(Textbox, "TextboxIcon");
export const TextHTwoIcon = duotone(TextHTwo, "TextHTwoIcon");
export const TextItalicIcon = duotone(TextItalic, "TextItalicIcon");
export const TrashIcon = duotone(Trash, "TrashIcon");
export const TrayIcon = duotone(Tray, "TrayIcon");
export const UploadSimpleIcon = duotone(UploadSimple, "UploadSimpleIcon");
export const UserCircleIcon = duotone(UserCircle, "UserCircleIcon");
export const VideoCameraIcon = duotone(VideoCamera, "VideoCameraIcon");
export const WarningIcon = duotone(Warning, "WarningIcon");
export const WarningOctagonIcon = duotone(WarningOctagon, "WarningOctagonIcon");
export const WrenchIcon = duotone(Wrench, "WrenchIcon");
export const XIcon = duotone(X, "XIcon");
