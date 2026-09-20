/**
 * Relays a storage stream while making failures after response start visible.
 * Cancelling the HTTP body cancels the upstream reader as well.
 */
export function observeMediaStream(
  source: ReadableStream<Uint8Array>,
  onError: (error: unknown) => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) controller.close();
        else controller.enqueue(result.value);
      } catch (error) {
        onError(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}
