import { type ContentProps, contentColumns, contentSpacing } from "./content-shared.js";
/** Equal-width columns that collapse as the container narrows. */
export function Grid({ children, columns, spacing }: ContentProps<"Grid">) {
  return (
    <div className="content-grid" style={{ ...contentColumns(columns), ...contentSpacing(spacing) }}>
      {children}
    </div>
  );
}
