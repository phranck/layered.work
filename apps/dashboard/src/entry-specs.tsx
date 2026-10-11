import { ENTRY_SPEC_LENGTH, type EntrySpec, entrySpecs, MAX_ENTRY_SPECS } from "@layered/schemas";
import { Button, Field, Input } from "@layered/ui";
import { PlusIcon, TrashIcon } from "@layered/ui/icons";
import { useRef, useState } from "react";
import { useDashboardLanguage } from "./language-context.js";
import { Reorder } from "./reorder.js";
import { moveItem } from "./sidebar-order.js";
import "./entry-specs.css";

/**
 * The specification pairs of a project, in the order its page shows them.
 *
 * Each pair is its label over its value, so both fields keep the panel's whole
 * width. A pair is moved by its grip, as the navigations' links are, and the
 * list stops growing at `MAX_ENTRY_SPECS`. A pair missing either half is said
 * to be one here, because the editor will not save it, and without the
 * sentence the disabled Save button would give no reason.
 *
 * @param specs - The pairs in the draft.
 * @param onChange - Replaces the draft's pairs.
 */
export function SpecsField({
  specs,
  onChange,
}: {
  specs: readonly EntrySpec[];
  onChange: (specs: EntrySpec[]) => void;
}) {
  const { text } = useDashboardLanguage();
  // The pairs carry no id, so React's keys are kept beside them and moved with
  // them, which keeps a field's focus on its pair whilst the list changes.
  const keys = useRef<string[]>([]);
  while (keys.current.length < specs.length) keys.current.push(crypto.randomUUID());
  keys.current.length = specs.length;
  const [added, setAdded] = useState<string | null>(null);

  const change = (index: number, part: keyof EntrySpec, value: string) =>
    onChange(specs.map((pair, position) => (position === index ? { ...pair, [part]: value } : pair)));
  const remove = (index: number) => {
    keys.current.splice(index, 1);
    onChange(specs.filter((_, position) => position !== index));
  };
  const move = (from: number, to: number) => {
    keys.current = moveItem(keys.current, from, to);
    onChange(moveItem(specs, from, to));
  };
  const add = () => {
    const key = crypto.randomUUID();
    keys.current.push(key);
    setAdded(key);
    onChange([...specs, { label: "", value: "" }]);
  };

  return (
    <Field label={text("editorSpecs")} hint={text("editorSpecsHint", MAX_ENTRY_SPECS)}>
      <Reorder.List className="spec-pairs" onMove={move}>
        {specs.map((pair, index) => {
          const key = keys.current[index] ?? String(index);
          const name = pair.label.trim() || text("editorSpecPair", index + 1);
          return (
            <Reorder.Item key={key} index={index}>
              <div className="spec-pair">
                <div className="spec-pair__fields">
                  <Input
                    aria-label={`${text("editorSpecLabel")} ${index + 1}`}
                    placeholder={text("editorSpecLabel")}
                    value={pair.label}
                    maxLength={ENTRY_SPEC_LENGTH.label}
                    autoFocus={key === added}
                    onChange={(event) => change(index, "label", event.target.value)}
                  />
                  <Input
                    aria-label={`${text("editorSpecValue")} ${index + 1}`}
                    placeholder={text("editorSpecValue")}
                    value={pair.value}
                    maxLength={ENTRY_SPEC_LENGTH.value}
                    onChange={(event) => change(index, "value", event.target.value)}
                  />
                </div>
                <div className="spec-pair__actions">
                  <Reorder.Handle index={index} label={text("moveGroup", name)} />
                  <Button.Icon
                    label={text("editorSpecRemove", name)}
                    icon={<TrashIcon />}
                    onClick={() => remove(index)}
                  />
                </div>
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.List>
      {!entrySpecs.safeParse(specs).success && (
        <p className="spec-pairs__problem" role="status">
          {text("editorSpecsIncomplete")}
        </p>
      )}
      <Button icon={<PlusIcon />} disabled={specs.length >= MAX_ENTRY_SPECS} onClick={add}>
        {text("editorSpecAdd")}
      </Button>
    </Field>
  );
}
