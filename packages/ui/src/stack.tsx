import type { ContentProps } from "./content-shared.js";
import { contentSpacing } from "./content-shared.js";

/** Stack parameters derive from both registered orientations. */
export type StackProps = (ContentProps<"VStack"> | ContentProps<"HStack">) & {
  direction?: "vertical" | "horizontal";
  wrap?: boolean;
};
/** Responsive composition: horizontal stacks always become vertical on phones. */
export function Stack({ children, spacing, align, direction = "vertical", wrap = true }: StackProps) {
  return (
    <div
      className="content-stack"
      data-direction={direction}
      data-align={align}
      data-wrap={wrap}
      style={contentSpacing(spacing)}
    >
      {children}
    </div>
  );
}
