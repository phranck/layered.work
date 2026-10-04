/** Finds raster media rendered at their original address without responsive sources. */
export function missingResponsiveImages(document, assets, pageUrl) {
  const rasterPaths = new Set(
    assets
      .filter((asset) => /^image\/(?:avif|jpeg|png|webp)$/.test(asset.mime))
      .map((asset) => new URL(asset.src, pageUrl).pathname),
  );
  return [...document.querySelectorAll("img[src]")].flatMap((image) => {
    const path = new URL(image.getAttribute("src"), pageUrl).pathname;
    return rasterPaths.has(path) && !image.getAttribute("srcset")?.trim()
      ? [`image ${path} has no srcset`]
      : [];
  });
}
