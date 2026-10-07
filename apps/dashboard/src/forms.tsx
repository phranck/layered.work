import { type CreateFormBody, createFormBody, type FormField, type FormFieldType } from "@layered/schemas";
import { Button, Card, Editor, Field, FormControls, Input, Select, Switch } from "@layered/ui";
import { FloppyDiskIcon, PlusIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PointerEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { ErrorNotice } from "./error-notice.js";
import { addField, FIELD_NAMES, FIELD_TYPES, newField, newForm, reorderFields } from "./forms-model.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";
import "./forms.css";

const words = {
  en: {
    add: "Add field",
    back: "Forms",
    create: "New form",
    empty: "No forms yet.",
    field: "Field",
    fields: "Fields",
    hint: "Hint",
    key: "Field name",
    label: "Label",
    name: "Form name",
    options: "Options",
    preview: "Preview",
    required: "Required",
    remove: "Remove field",
    save: "Save",
    saving: "Saving…",
    saved: "Form saved",
    settings: "Form settings",
    slug: "Shortcode name",
    notification: "Notification email",
    confirmation: "Confirmation email field",
    noConfirmation: "Do not send confirmations",
    success: "Success message",
    store: "Store submissions",
    pattern: "Pattern",
    minLength: "Minimum length",
    maxLength: "Maximum length",
    min: "Minimum",
    max: "Maximum",
    notice: "Consent notice",
    revision: "Consent revision",
    validation: "Check the highlighted form declaration:",
    move: "Drag to reorder. Arrow keys also move this field.",
  },
  de: {
    add: "Feld hinzufügen",
    back: "Formulare",
    create: "Neues Formular",
    empty: "Noch keine Formulare.",
    field: "Feld",
    fields: "Felder",
    hint: "Hinweis",
    key: "Feldname",
    label: "Beschriftung",
    name: "Formularname",
    options: "Optionen",
    preview: "Vorschau",
    required: "Erforderlich",
    remove: "Feld entfernen",
    save: "Speichern",
    saving: "Speichert…",
    saved: "Formular gespeichert",
    settings: "Formulareinstellungen",
    slug: "Shortcode-Name",
    notification: "Benachrichtigungs-E-Mail",
    confirmation: "E-Mail-Feld für Bestätigung",
    noConfirmation: "Keine Bestätigung senden",
    success: "Erfolgsmeldung",
    store: "Einsendungen speichern",
    pattern: "Muster",
    minLength: "Mindestlänge",
    maxLength: "Maximallänge",
    min: "Minimum",
    max: "Maximum",
    notice: "Einwilligungstext",
    revision: "Einwilligungsversion",
    validation: "Bitte Formulardeklaration prüfen:",
    move: "Zum Sortieren ziehen. Pfeiltasten verschieben das Feld ebenfalls.",
  },
} as const;

type Word = keyof typeof words.en;
const formsKey = ["forms"] as const;

/** The list follows the same card and app-bar pattern as the entry lists. */
export function FormsScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const { language } = useDashboardLanguage();
  const w = words[language];
  const list = useQuery({ queryKey: formsKey, queryFn: api.fetchForms });
  return (
    <>
      <ScreenTitle title={w.back} />
      <HeaderEnd>
        <Button tone="primary" icon={<PlusIcon />} onClick={() => navigate(`/${area.path}/new`)}>
          {w.create}
        </Button>
      </HeaderEnd>
      <Card>
        <Card.Header title={w.back} meta={list.data?.length} />
        {list.isError && (
          <Card.Body>
            <ErrorNotice error={list.error} />
          </Card.Body>
        )}
        {list.isSuccess && list.data.length === 0 && (
          <Card.Body>
            <p className="unfinished">{w.empty}</p>
          </Card.Body>
        )}
        {list.isSuccess && list.data.length > 0 && (
          <div className="forms-list">
            {list.data.map((form) => (
              <button
                key={form.id}
                type="button"
                className="forms-list__row"
                onClick={() => navigate(`/${area.path}/${form.id}`)}
              >
                <span>{form.name}</span>
                <code>{form.slug}</code>
                <span>
                  {form.fields.length} {w.fields.toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function NumberSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field label={label} htmlFor={`form-${label}`}>
      <Input
        id={`form-${label}`}
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </Field>
  );
}

/** Type-specific validation and choices, beside the shared field properties. */
function FieldRules({
  field,
  update,
  w,
}: {
  field: FormField;
  update: (field: FormField) => void;
  w: Record<Word, string>;
}) {
  if (field.type === "shortText" || field.type === "longText" || field.type === "email") {
    return (
      <>
        <NumberSetting
          label={w.minLength}
          value={field.minLength}
          onChange={(value) => update({ ...field, minLength: value ?? 0 })}
        />
        <NumberSetting
          label={w.maxLength}
          value={field.maxLength}
          onChange={(value) => update({ ...field, maxLength: value ?? 1 })}
        />
        <Field label={w.pattern} htmlFor="form-pattern">
          <Input
            id="form-pattern"
            value={field.pattern ?? ""}
            onChange={(event) => update({ ...field, pattern: event.target.value || null })}
          />
        </Field>
      </>
    );
  }
  if (field.type === "number") {
    return (
      <>
        <NumberSetting
          label={w.min}
          value={field.min}
          onChange={(value) => update({ ...field, min: value })}
        />
        <NumberSetting
          label={w.max}
          value={field.max}
          onChange={(value) => update({ ...field, max: value })}
        />
      </>
    );
  }
  if (field.type === "date") {
    return (
      <>
        <Field label={w.min} htmlFor="form-date-min">
          <Input
            id="form-date-min"
            type="date"
            value={field.min ?? ""}
            onChange={(event) => update({ ...field, min: event.target.value || null })}
          />
        </Field>
        <Field label={w.max} htmlFor="form-date-max">
          <Input
            id="form-date-max"
            type="date"
            value={field.max ?? ""}
            onChange={(event) => update({ ...field, max: event.target.value || null })}
          />
        </Field>
      </>
    );
  }
  if (field.type === "singleChoice" || field.type === "multipleChoice") {
    return (
      <div className="forms-options">
        <strong>{w.options}</strong>
        {field.options.map((option, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Option order is fixed and inputs are controlled; values are editable.
          <div key={index} className="forms-option">
            <Field label={`${w.key} ${index + 1}`} htmlFor={`option-value-${index}`}>
              <Input
                id={`option-value-${index}`}
                value={option.value}
                onChange={(event) =>
                  update({
                    ...field,
                    options: field.options.map((item, i) =>
                      i === index ? { ...item, value: event.target.value } : item,
                    ),
                  })
                }
              />
            </Field>
            <Translated.Field
              id={`form-option-label-${index}`}
              label={`${w.label} ${index + 1}`}
              value={option.label}
              onChange={(label) =>
                update({
                  ...field,
                  options: field.options.map((item, i) => (i === index ? { ...item, label } : item)),
                })
              }
            />
            <Button
              disabled={field.options.length <= 2}
              onClick={() => update({ ...field, options: field.options.filter((_, i) => i !== index) })}
            >
              {w.remove}
            </Button>
          </div>
        ))}
        <Button
          onClick={() => {
            let n = field.options.length + 1;
            while (field.options.some((option) => option.value === `option-${n}`)) n += 1;
            update({
              ...field,
              options: [
                ...field.options,
                { value: `option-${n}`, label: { en: `Option ${n}`, de: `Option ${n}` } },
              ],
            });
          }}
        >
          {w.add}
        </Button>
      </div>
    );
  }
  if (field.type === "consent") {
    return (
      <>
        <Translated.Field
          id="form-notice"
          label={w.notice}
          value={field.notice}
          onChange={(notice) => update({ ...field, notice })}
          multiline
        />
        <Field label={w.revision} htmlFor="form-revision">
          <Input
            id="form-revision"
            value={field.revision}
            onChange={(event) => update({ ...field, revision: event.target.value })}
          />
        </Field>
      </>
    );
  }
  return null;
}

/** One form, with the existing Editor compound layout and one selected field's settings. */
export function FormEditorScreen({ area }: { area: DashboardArea }) {
  const { id } = useParams();
  const isNew = id === "new";
  const api = useDashboardApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { language } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const w = words[language];
  const loaded = useQuery({
    queryKey: ["form", id],
    queryFn: () => api.fetchForm(id ?? ""),
    enabled: Boolean(id && !isNew),
  });
  const [draft, setDraft] = useState<CreateFormBody | null>(isNew ? newForm() : null);
  const [selected, setSelected] = useState<number | null>(null);
  const [addType, setAddType] = useState<FormFieldType>("shortText");
  const [problem, setProblem] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);

  useEffect(() => {
    if (loaded.data) {
      const {
        slug,
        name,
        notificationEmail,
        confirmationEmailField,
        successMessage,
        storeSubmissions,
        fields,
      } = loaded.data;
      setDraft({
        slug,
        name,
        notificationEmail,
        confirmationEmailField: confirmationEmailField ?? null,
        successMessage,
        storeSubmissions,
        fields,
      });
    }
  }, [loaded.data]);

  const save = useMutation({
    mutationFn: (value: CreateFormBody) => (isNew ? api.createForm(value) : api.saveForm(id ?? "", value)),
    onError: (error) => notifyError(error),
    onSuccess: (saved) => {
      queryClient.setQueryData(["form", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: formsKey });
      void refreshCounts(queryClient);
      notify({ tone: "success", message: w.saved });
      if (isNew) navigate(`/${area.path}/${saved.id}`, { replace: true });
    },
  });

  const submit = () => {
    if (!draft) return;
    const checked = createFormBody.safeParse(draft);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      setProblem(`${w.validation} ${issue?.path.join(".")}: ${issue?.message}`);
      return;
    }
    setProblem("");
    save.mutate(checked.data);
  };
  const change = (next: CreateFormBody) => {
    setDraft(next);
    setProblem("");
  };
  const updateField = (index: number, field: FormField) => {
    if (!draft) return;
    change({ ...draft, fields: draft.fields.map((current, i) => (i === index ? field : current)) });
  };
  const selectedField = selected === null ? null : draft?.fields[selected];

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragged === null || !draft) return;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-field-index]");
    const to = Number(row?.dataset.fieldIndex);
    if (row && Number.isInteger(to)) {
      change(reorderFields(draft, dragged, to));
      setSelected(to);
    }
    setDragged(null);
  };

  return (
    <>
      <ScreenTitle title={draft?.name || w.create} />
      <HeaderEnd>
        <Button onClick={() => navigate(`/${area.path}`)}>{w.back}</Button>
        <Button tone="primary" icon={<FloppyDiskIcon />} disabled={!draft || save.isPending} onClick={submit}>
          {save.isPending ? w.saving : w.save}
        </Button>
      </HeaderEnd>
      {loaded.isError && <ErrorNotice error={loaded.error} />}
      {problem && (
        <p role="alert" className="dashboard-error">
          {problem}
        </p>
      )}
      {draft && (
        <Translated>
          <Editor className="forms-editor">
            <Editor.Main>
              <Card>
                <Card.Header
                  title={draft.name || w.create}
                  meta={draft.fields.length}
                  actions={<Button onClick={() => setSelected(null)}>{w.settings}</Button>}
                />
                <Card.Body>
                  <div className="forms-fields">
                    {draft.fields.map((field, index) => (
                      <div
                        key={field.key}
                        className="forms-fields__row"
                        data-field-index={index}
                        data-selected={selected === index || undefined}
                      >
                        <button
                          type="button"
                          className="forms-fields__grip"
                          aria-label={`${w.move} ${field.label[language]}`}
                          title={w.move}
                          onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDragged(index);
                          }}
                          onPointerUp={onPointerUp}
                          onPointerCancel={() => setDragged(null)}
                          onKeyDown={(event) => {
                            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                            event.preventDefault();
                            const to = Math.max(
                              0,
                              Math.min(draft.fields.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)),
                            );
                            change(reorderFields(draft, index, to));
                            setSelected(to);
                          }}
                        >
                          ⋮⋮
                        </button>
                        <button
                          type="button"
                          className="forms-fields__select"
                          onClick={() => setSelected(index)}
                        >
                          <span>{field.label[language] || field.key}</span>
                          <small>
                            {FIELD_NAMES[field.type][language]} · {field.key}
                          </small>
                        </button>
                      </div>
                    ))}
                  </div>
                </Card.Body>
                <Card.Footer
                  actions={
                    <div className="forms-add">
                      <Select
                        aria-label={w.field}
                        value={addType}
                        options={FIELD_TYPES.map((type) => ({
                          value: type,
                          label: FIELD_NAMES[type][language],
                        }))}
                        onChange={(event) => setAddType(event.target.value as FormFieldType)}
                      />
                      <Button
                        icon={<PlusIcon />}
                        onClick={() => {
                          const next = addField(draft, addType);
                          change(next);
                          setSelected(next.fields.length - 1);
                        }}
                      >
                        {w.add}
                      </Button>
                    </div>
                  }
                />
              </Card>
              <Card>
                <Card.Header title={w.preview} />
                <Card.Body>
                  <FormPreview fields={draft.fields} />
                </Card.Body>
              </Card>
            </Editor.Main>
            <Editor.Panel
              title={selectedField ? selectedField.label[language] || w.field : w.settings}
              headerActions={<Translated.Switch />}
            >
              {selectedField && selected !== null ? (
                <>
                  <Field label={w.field} htmlFor="form-type">
                    <Select
                      id="form-type"
                      value={selectedField.type}
                      options={FIELD_TYPES.map((type) => ({
                        value: type,
                        label: FIELD_NAMES[type][language],
                      }))}
                      onChange={(event) => {
                        const replacement = newField(event.target.value as FormFieldType, selectedField.key);
                        updateField(selected, {
                          ...replacement,
                          label: selectedField.label,
                          hint: selectedField.hint,
                          required: selectedField.required,
                        });
                      }}
                    />
                  </Field>
                  <Field label={w.key} htmlFor="form-key">
                    <Input
                      id="form-key"
                      value={selectedField.key}
                      onChange={(event) =>
                        updateField(selected, { ...selectedField, key: event.target.value })
                      }
                    />
                  </Field>
                  <Translated.Field
                    id="form-field-label"
                    label={w.label}
                    value={selectedField.label}
                    onChange={(label) => updateField(selected, { ...selectedField, label })}
                  />
                  <Translated.Field
                    id="form-field-hint"
                    label={w.hint}
                    value={selectedField.hint}
                    onChange={(hint) => updateField(selected, { ...selectedField, hint })}
                  />
                  <Field.Inline label={w.required} htmlFor="form-required">
                    <Switch
                      id="form-required"
                      aria-label={w.required}
                      checked={selectedField.required}
                      onCheckedChange={(required) => updateField(selected, { ...selectedField, required })}
                    />
                  </Field.Inline>
                  <FieldRules field={selectedField} update={(field) => updateField(selected, field)} w={w} />
                  <Button
                    disabled={draft.fields.length <= 1}
                    onClick={() => {
                      change({ ...draft, fields: draft.fields.filter((_, index) => index !== selected) });
                      setSelected(null);
                    }}
                  >
                    {w.remove}
                  </Button>
                </>
              ) : (
                <>
                  <Field label={w.name} htmlFor="form-name">
                    <Input
                      id="form-name"
                      value={draft.name}
                      onChange={(event) => change({ ...draft, name: event.target.value })}
                    />
                  </Field>
                  <Field label={w.slug} htmlFor="form-slug">
                    <Input
                      id="form-slug"
                      value={draft.slug}
                      onChange={(event) => change({ ...draft, slug: event.target.value })}
                    />
                  </Field>
                  <Field label={w.notification} htmlFor="form-notification">
                    <Input
                      id="form-notification"
                      type="email"
                      value={draft.notificationEmail ?? ""}
                      onChange={(event) =>
                        change({ ...draft, notificationEmail: event.target.value || null })
                      }
                    />
                  </Field>
                  <Field label={w.confirmation} htmlFor="form-confirmation">
                    <Select
                      id="form-confirmation"
                      value={draft.confirmationEmailField ?? ""}
                      options={[
                        { value: "", label: w.noConfirmation },
                        ...draft.fields
                          .filter((field) => field.type === "email")
                          .map((field) => ({ value: field.key, label: field.label[language] || field.key })),
                      ]}
                      onChange={(event) =>
                        change({ ...draft, confirmationEmailField: event.target.value || null })
                      }
                    />
                  </Field>
                  <Translated.Field
                    id="form-success"
                    label={w.success}
                    value={draft.successMessage}
                    onChange={(successMessage) => change({ ...draft, successMessage })}
                    multiline
                  />
                  <Field.Inline label={w.store} htmlFor="form-store">
                    <Switch
                      id="form-store"
                      aria-label={w.store}
                      checked={draft.storeSubmissions}
                      onCheckedChange={(storeSubmissions) => change({ ...draft, storeSubmissions })}
                    />
                  </Field.Inline>
                </>
              )}
            </Editor.Panel>
          </Editor>
        </Translated>
      )}
    </>
  );
}

/**
 * The form as a reader would see it, in the language the panel's switch has
 * chosen, so the texts being edited show where they will appear.
 *
 * @param fields - The form's fields as drafted.
 */
function FormPreview({ fields }: { fields: CreateFormBody["fields"] }) {
  return <FormControls fields={fields} language={useTextLanguage()} />;
}
