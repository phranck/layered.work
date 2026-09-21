import type { ContentProps } from "./content-shared.js";
import { Figure } from "./figure.js";
import { Grid } from "./grid.js";

function GalleryRoot({ children, columns, spacing }: ContentProps<"Gallery">) {
  return (
    <section className="content-gallery" aria-label="Gallery">
      <Grid columns={columns} spacing={spacing}>
        {children}
      </Grid>
    </section>
  );
}
/** A set of images using the same frame and responsive column rules. */
export const Gallery = Object.assign(GalleryRoot, { Item: Figure });
