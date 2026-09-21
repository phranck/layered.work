import type { Icon } from "@phosphor-icons/react";
import * as icons from "@phosphor-icons/react/dist/ssr";
import { Button } from "./button.js";
import { Card } from "./card.js";
import { type ContentProps, contentUrl, type MediaResolver } from "./content-shared.js";
import { Figure } from "./figure.js";

/** Render a registered button with the existing button compound. */
export function ContentButton({ label, href, tone, icon }: ContentProps<"Button">) {
  const url = contentUrl(href);
  const name =
    typeof icon === "string"
      ? icon
          .split(/[-_]/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("")
      : undefined;
  // Content names any Phosphor icon at runtime. This SSR renderer deliberately keeps
  // the catalogue available; ordinary interactive UI keeps using static imports.
  // biome-ignore lint/performance/noDynamicNamespaceImportAccess: The authored icon vocabulary is open.
  const Icon = (icons[`${name}Icon` as keyof typeof icons] ?? icons.ArrowUpRightIcon) as Icon;
  const emphasis = tone === "primary" || tone === "danger" ? tone : "secondary";
  const mark = <Icon weight="duotone" />;
  return (
    <div className="content-action">
      {url ? (
        <Button.Link href={url} tone={emphasis} icon={mark}>
          {label}
        </Button.Link>
      ) : (
        <Button.Inert tone={emphasis} icon={mark}>
          {label}
        </Button.Inert>
      )}
    </div>
  );
}
/** Render a registered card without nesting body links inside a link. */
export function ContentCard({
  title,
  href,
  image,
  children,
  media,
}: ContentProps<"Card"> & { media: MediaResolver }) {
  const url = contentUrl(href);
  // A title link keeps prose links and controls valid: wrapping the complete
  // body in an anchor would put interactive descendants inside another anchor.
  return (
    <Card>
      {image && <Figure slug={image} media={media} />}
      {title && <Card.Header title={url ? <a href={url}>{title}</a> : title} />}
      <Card.Stack>{children}</Card.Stack>
      {url && !title && (
        <Card.Footer>
          <Button.Link href={url} icon={<icons.ArrowUpRightIcon weight="duotone" />}>
            Read more
          </Button.Link>
        </Card.Footer>
      )}
    </Card>
  );
}
