/** Rewrite generated client assets for a static preview mounted below the origin root. */
export function rewritePreloadHelper(source, prefix) {
  return source.replace(/return(["'`])\/\1\+/g, (_, quote) => `return${quote}${prefix}${quote}+`);
}
