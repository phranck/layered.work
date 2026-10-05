/** Upgrade only models that enter the viewport, sharing one viewer import. */
export function activateVisibleModels(loadViewer: () => Promise<unknown>, root: ParentNode = document): void {
  const models = root.querySelectorAll<HTMLElement>("model-viewer[data-model-src]");
  if (!models.length) return;
  let viewer: Promise<unknown> | undefined;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        viewer ??= loadViewer();
        const model = entry.target;
        void viewer.then(() => {
          const src = model.getAttribute("data-model-src");
          if (src) model.setAttribute("src", src);
        });
      }
    },
    { rootMargin: "0px" },
  );
  for (const model of models) observer.observe(model);
}
