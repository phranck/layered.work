import { components, renderContent } from "@layered/content";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONTENT_RENDERERS } from "./content-adapters.js";
import { ContentRenderer, type MediaResolver } from "./content-renderer.js";
import * as ui from "./index.js";

const media: MediaResolver = (slug) => ({
  src: `/media/${slug}`,
  alt: "Library alt",
  caption: "Library caption",
  width: 800,
  height: 600,
  filename: slug,
  mime: slug.endsWith("mp4") ? "video/mp4" : undefined,
});
const draw = (source: string) =>
  renderToStaticMarkup(<ContentRenderer nodes={renderContent(source)} media={media} />);

describe("content renderer", () => {
  it("wraps semantic tables in their shared card scroller", () => {
    const template = document.createElement("template");
    template.innerHTML = draw("| Name | Value |\n| --- | --- |\n| Item | 42 |");
    const wrapper = template.content.querySelector(".content-table");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.firstElementChild?.tagName).toBe("TABLE");
    expect(wrapper?.querySelector("th")?.textContent).toBe("Name");
    expect(wrapper?.querySelector("td")?.textContent).toBe("Item");
  });
  it("shows a fenced block as code whatever language it names", () => {
    // Nothing turns a code fence into anything but code. A diagram is a picture
    // in the content, so no language is treated specially here.
    const source = "flowchart LR\n A[USB Input] --> B[USB DAC]";
    const template = document.createElement("template");
    template.innerHTML = draw(`\`\`\`mermaid\n${source}\n\`\`\``);
    expect(template.content.querySelector("[data-code-block]")).not.toBeNull();
    expect(template.content.querySelector("code")?.textContent).toBe(source);
  });
  it("exports and maps every renderer the register declares", () => {
    const names = [...new Set(Object.values(components).map((entry) => entry.renders))].sort();
    expect(Object.keys(CONTENT_RENDERERS).sort()).toEqual(names);
    for (const name of names) expect(ui).toHaveProperty(name);
    for (const entry of Object.values(components))
      expect(draw(entry.example)).not.toContain("content-placeholder");
  });
  it("composes the epic's two columns with semantic media and note", () => {
    const html = draw(
      'HStack(spacing: 6, align: top) {\n Image("front", caption: "The front")\n VStack {\n ## Enclosure\n\n Two halves.\n\n Spacer()\n Button("See model", href: "#model", icon: cube, tone: primary)\n }\n}\nModel("model.glb", alt: "SoundBox")\nNote(tone: warning) { Needs 16 GB. }',
    );
    expect(html).toContain('data-direction="horizontal"');
    expect(html).toContain('src="/media/front"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("The front");
    expect(html).toContain('<h2 id="enclosure">Enclosure</h2>');
    expect(html).toContain('href="#model"');
    expect(html).toContain("<model-viewer");
    expect(html).toContain('src="/media/model.glb"');
    expect(html).toContain('data-tone="warning"');
  });
  it("renders native video and document assets from the resolver", () => {
    const html = draw('Video("clip.mp4", poster: "still.jpg")\nPdf("manual.pdf", label: "Manual")');
    expect(html).toContain("<video");
    expect(html).toContain('poster="/media/still.jpg"');
    expect(html).toContain('src="/media/clip.mp4"');
    expect(html).toContain('href="/media/manual.pdf"');
    expect(html).toContain("Manual");
  });
  it("renders raw HTML and code as text, and names missing components", () => {
    const html = draw('<script>alert("x")</script>\n\n```js\n<script>\n```\n\nMissingThing()');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('data-language="js"');
    expect(html).toContain("MissingThing");
    expect(html).toContain("content-placeholder");
  });
  it("renders a separate line gutter and a copy hook without changing the code source", () => {
    const source = 'const sample = "<script>";\n\n  sample();\n';
    const html = renderToStaticMarkup(
      <ContentRenderer nodes={[{ kind: "code", language: "js", source }]} media={media} />,
    );
    const template = document.createElement("template");
    template.innerHTML = html;
    const block = template.content.querySelector("[data-code-block]");
    expect(block).not.toBeNull();
    expect(block?.querySelector("code")?.textContent).toBe(source);
    const gutter = block?.querySelector(".content-code__gutter");
    expect(gutter?.textContent).toBe("1\n2\n3");
    expect(gutter?.getAttribute("aria-hidden")).toBe("true");
    expect(block?.querySelector("[data-copy-code]")?.getAttribute("aria-label")).toBe("Copy code");
    expect(block?.querySelector("code .content-code__gutter")).toBeNull();
  });
  it("refuses active URLs in prose, buttons and media without dropping their text", () => {
    const html = draw('[Bad](javascript:alert)\n\nButton("Bad button", href: "data:text/html,bad")');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("Bad button");
    const unsafe = renderToStaticMarkup(
      <ContentRenderer nodes={renderContent('Image("bad")')} media={() => ({ src: "javascript:bad" })} />,
    );
    expect(unsafe).not.toContain("javascript:");
    expect(unsafe).toContain("bad");
  });
  it("shows a raster placeholder while keeping focal position and caller sizes", () => {
    const html = renderToStaticMarkup(
      <ui.Figure.Image
        asset={{
          src: "/media/image.webp",
          srcSet: "/media/image.webp 800w",
          sizes: "(max-width: 719px) 100vw, 1092px",
          placeholder: "data:image/webp;base64,UklGRg==",
          focalPoint: { x: 0.25, y: 0.75 },
        }}
      />,
    );
    expect(html).toContain("background-image:url(data:image/webp;base64,UklGRg==)");
    expect(html).toContain("object-position:25% 75%");
    expect(html).toContain('sizes="(max-width: 719px) 100vw, 1092px"');
    const unsafe = renderToStaticMarkup(
      <ui.Figure.Image
        asset={{ src: "/media/image.webp", placeholder: "data:image/svg+xml;base64,PHN2Zz4=" }}
      />,
    );
    expect(unsafe).not.toContain("background-image");
  });
  it("keeps a draft with an invalid icon parameter renderable", () => {
    expect(draw('Button("Draft action", href: "/draft", icon: 2)')).toContain("Draft action");
  });
  it("keeps unresolved media visible and uses library alt and dimensions", () => {
    const missing = renderToStaticMarkup(
      <ContentRenderer nodes={renderContent('Image("missing")')} media={() => undefined} />,
    );
    expect(missing).toContain("missing");
    const html = draw('Image("front")');
    expect(html).toContain('alt="Library alt"');
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
  });
});
