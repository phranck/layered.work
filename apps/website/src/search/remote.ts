import type { PublicSearchResults } from "@layered/schemas";

type Failure = { code: string; message: string; id?: string; status: number };

/** Debounced overlay requests; a previous query cannot replace the current one. */
export function createRemoteSearch(
  source: string,
  show: (result: PublicSearchResults, query: string) => void,
  fail: (error: Failure) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let revision = 0;
  return (query: string) => {
    clearTimeout(timer);
    controller?.abort();
    const current = ++revision;
    if (!query.trim()) {
      show({ entries: [], total: 0 }, query);
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    timer = setTimeout(async () => {
      try {
        const separator = source.includes("?") ? "&" : "?";
        const response = await fetch(
          `${source}${separator}${new URLSearchParams({ q: query, limit: "6" })}`,
          { signal, headers: { Accept: "application/json" } },
        );
        const body = await response.json();
        if (current !== revision) return;
        if (!response.ok) {
          fail({
            code: body?.error?.code ?? "WEBSITE_SEARCH_UNAVAILABLE",
            message: body?.error?.message ?? "Search is unavailable.",
            id: body?.error?.id,
            status: response.status,
          });
          return;
        }
        show(body, query);
      } catch {
        if (current === revision && !signal.aborted)
          fail({ code: "WEBSITE_SEARCH_UNAVAILABLE", message: "Search is unavailable.", status: 503 });
      }
    }, 250);
  };
}
