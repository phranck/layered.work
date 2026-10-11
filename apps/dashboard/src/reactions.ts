/**
 * What a screen does once a change it asked for has been stored or has failed.
 *
 * A query module owns what a change does to the cache, and a screen owns what
 * the reader is told and where they go next. A mutation hook takes these and
 * runs them after its own cache work, so a screen's reaction always meets the
 * cache as it stands after the change.
 *
 * `onError` is handed the failure alone. A hook calls it as
 * `(error) => reactions.onError?.(error)` and never passes it to TanStack
 * Query as it stands, because the query library calls it with more arguments,
 * and `notifyError` would read the second one as its fallback text.
 *
 * @property onSuccess - Runs once the API has stored the change, with its answer
 *   and what was sent.
 * @property onError - Runs when the API refused the change or could not be reached.
 */
export interface Reactions<Result, Variables = void> {
  onSuccess?: (result: Result, variables: Variables) => void;
  onError?: (error: Error) => void;
}
