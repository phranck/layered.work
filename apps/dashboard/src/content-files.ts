import { EditorView } from "@codemirror/view";
import { componentForMedia } from "@layered/content";
import type { MediaKind } from "@layered/schemas";
import type { MediaLibrary } from "./content-completion.js";
import { insertComponentBlock } from "./content-insert.js";
import { componentSnippet } from "./editor-toolbar.js";

/**
 * Files dropped onto the writing surface or pasted into it.
 *
 * Each one goes into the media library and comes back as the component the
 * register names for its kind, written at the cursor the way the toolbar writes
 * a component. Nothing is inserted for a file the library refused or failed to
 * take, so a failed upload leaves the text exactly as it was.
 */

/**
 * The component a file of one kind is shown with, naming that file.
 *
 * Written the way the toolbar writes the component, with the slug as its first
 * value, so a value the component cannot do without and the file does not
 * provide stands as an empty placeholder for the author.
 *
 * @param kind - The kind of file in the library.
 * @param slug - The file's slug.
 * @returns The component, or null where the register shows no component for
 *   that kind.
 */
export function componentForFile(kind: MediaKind, slug: string): string | null {
  const name = componentForMedia(kind);
  return name ? componentSnippet(name).replace('""', `"${slug}"`) : null;
}

/** Uploads files and inserts a component for each one the library took, in the order given. */
function insertUploads(view: EditorView, library: MediaLibrary, files: readonly File[]): void {
  void library.uploadFiles(files, ({ kind, slug }) => {
    const component = componentForFile(kind, slug);
    if (component && view.dom.isConnected) insertComponentBlock(view, component);
  });
}

/**
 * Accepts files dropped anywhere on the surface and files pasted into it.
 *
 * A drop moves the cursor to where the files were let go, so their components
 * land there, one after another in the order they were dropped. A paste or a
 * drop that carries no file is text, and is left to the surface.
 *
 * @param library - Where the files go.
 */
export function contentFileDrop(library: MediaLibrary) {
  return EditorView.domEventHandlers({
    drop(event, view) {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return false;
      event.preventDefault();
      const at = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (at !== null) view.dispatch({ selection: { anchor: at } });
      insertUploads(view, library, files);
      return true;
    },
    paste(event, view) {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return false;
      event.preventDefault();
      insertUploads(view, library, files);
      return true;
    },
  });
}
