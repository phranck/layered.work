/**
 * Interface icons use Phosphor components, never hand-written SVG paths.
 * Explicit submodule exports avoid loading the entire catalogue in development.
 * The SSR variants also work in the browser and default to 1em/currentColor,
 * so Row.Lead supplies the sidebar and content icon sizes from its tokens.
 */

export type { IconProps, IconWeight } from "@phosphor-icons/react";
export { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
export { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
export { SquaresFourIcon } from "@phosphor-icons/react/dist/ssr/SquaresFour";
