import type { PropsOf } from "@layered/content";
/** Semantic separation between two parts of a document. */
export function Divider(_props: PropsOf<"Divider">) {
  return <hr className="content-divider" />;
}
