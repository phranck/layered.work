/** Keep authored Mermaid inert until the website renders it into an SVG image. */
export function MermaidDiagram({ source }: { source: string }) {
  return (
    <figure className="content-diagram" data-mermaid-diagram="">
      <template data-mermaid-source="">{source}</template>
      <div className="content-diagram__output" data-mermaid-output="">
        <p role="status">Rendering diagram…</p>
      </div>
      <noscript>JavaScript is required to display this diagram.</noscript>
    </figure>
  );
}
