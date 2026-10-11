import { type KeyboardEvent, useState } from "react";

/**
 * A list of options under a text field that keeps the focus, as the search
 * dialog and the editor's topic field have: the arrow keys move the active
 * option round the list, Enter chooses it, and the pointer makes the option it
 * moves over the active one.
 *
 * The field keeps the focus throughout, so a screen reader learns the active
 * option from `aria-activedescendant`, and the option carries `aria-selected`
 * and `data-active`, which is how every selected row in the dashboard is
 * marked.
 *
 * @param options - What the list offers, in order.
 * @param choose - Called with the option Enter chooses.
 * @returns The active option and its position, `reset` for when the list
 *   changes, the field's `onKeyDown`, which says whether it handled the key, and
 *   the props of the option at a position.
 */
export function useListbox<Option>(options: readonly Option[], choose: (option: Option) => void) {
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, options.length - 1);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((activeIndex + step + options.length) % options.length);
      }
      return true;
    }
    const option = options[activeIndex];
    if (event.key === "Enter" && option !== undefined) {
      event.preventDefault();
      choose(option);
      return true;
    }
    return false;
  };
  return {
    activeIndex,
    activeOption: options[activeIndex],
    reset: () => setActive(0),
    onKeyDown,
    optionProps: (index: number) => ({
      role: "option" as const,
      "aria-selected": index === activeIndex,
      "data-active": index === activeIndex ? "" : undefined,
      onMouseMove: () => setActive(index),
    }),
  };
}
