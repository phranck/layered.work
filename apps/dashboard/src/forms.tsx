import { type CreateFormBody, createFormBody, type FormField, type FormFieldType } from "@layered/schemas";
import { Button, Card, Editor, Field, FormControls, Input, Select, Switch } from "@layered/ui";
import { FloppyDiskIcon, PencilSimpleIcon, PlusIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { DataTable } from "./data-table.js";
import { ErrorNotice } from "./error-notice.js";
import { addField, FIELD_NAMES, FIELD_TYPES, newField, newForm, reorderFields } from "./forms-model.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";
import { Reorder } from "./reorder.js";
import type { DashboardArea } from "./routes.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";
import "./forms.css";

const formsKey = ["forms"] as const;

/** The list follows the same card and app-bar pattern as the entry lists. */
export function FormsScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const { text } = useDashboardLanguage();
  const list = useQuery({ queryKey: formsKey, queryFn: api.fetchForms });
  return (
    <>
      <ScreenTitle title={text("forms")} />
      <HeaderEnd>
        <Button tone="primary" icon={<PlusIcon />} onClick={() => navigate(`/${area.path}/new`)}>
          {text("formNew")}
        </Button>
      </HeaderEnd>
      <Card>
        <Card.Header title={text("forms")} meta={list.data?.length} />
        {list.isError && (
          <Card.Body>
            <ErrorNotice error={list.error} />
          </Card.Body>
        )}
        {list.isSuccess && list.data.length === 0 && (
          <Card.Body>
            <p className="unfinished">{text("formsEmpty")}</p>
          </Card.Body>
        )}
        {list.isSuccess && list.data.length > 0 && (
          <DataTable
            columns={[
              { kind: "title", label: text("columnName") },
              { kind: "count", label: text("columnFields") },
              { kind: "action", label: text("columnAction") },
            ]}
          >
            {list.data.map((form) => {
              const open = () => navigate(`/${area.path}/${form.id}`);
              return (
                <DataTable.Row key={form.id} onOpen={open}>
                  <DataTable.Cell kind="title">
                    <DataTable.Title title={form.name} note={form.slug} />
                  </DataTable.Cell>
                  <DataTable.Cell kind="count">{form.fields.length}</DataTable.Cell>
                  <DataTable.Actions>
                    <Button.Icon
                      label={text("editForm")}
                      icon={<PencilSimpleIcon />}
                      tabIndex={-1}
                      onClick={open}
                    />
                  </DataTable.Actions>
                </DataTable.Row>
              );
            })}
          </DataTable>
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
function FieldRules({ field, update }: { field: FormField; update: (field: FormField) => void }) {
  const { text } = useDashboardLanguage();
  if (field.type === "shortText" || field.type === "longText" || field.type === "email") {
    return (
      <>
        <NumberSetting
          label={text("formMinLength")}
          value={field.minLength}
          onChange={(value) => update({ ...field, minLength: value ?? 0 })}
        />
        <NumberSetting
          label={text("formMaxLength")}
          value={field.maxLength}
          onChange={(value) => update({ ...field, maxLength: value ?? 1 })}
        />
        <Field label={text("formPattern")} htmlFor="form-pattern">
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
          label={text("formMin")}
          value={field.min}
          onChange={(value) => update({ ...field, min: value })}
        />
        <NumberSetting
          label={text("formMax")}
          value={field.max}
          onChange={(value) => update({ ...field, max: value })}
        />
      </>
    );
  }
  if (field.type === "date") {
    return (
      <>
        <Field label={text("formMin")} htmlFor="form-date-min">
          <Input
            id="form-date-min"
            type="date"
            value={field.min ?? ""}
            onChange={(event) => update({ ...field, min: event.target.value || null })}
          />
        </Field>
        <Field label={text("formMax")} htmlFor="form-date-max">
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
        <strong>{text("formOptions")}</strong>
        {field.options.map((option, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Option order is fixed and inputs are controlled; values are editable.
          <div key={index} className="forms-option">
            <Field label={text("formOptionValue", index + 1)} htmlFor={`option-value-${index}`}>
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
              label={text("formOptionLabel", index + 1)}
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
              {text("formOptionRemove", index + 1)}
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
          {text("formOptionAdd")}
        </Button>
      </div>
    );
  }
  if (field.type === "consent") {
    return (
      <>
        <Translated.Field
          id="form-notice"
          label={text("formConsentNotice")}
          value={field.notice}
          onChange={(notice) => update({ ...field, notice })}
          multiline
        />
        <Field label={text("formConsentRevision")} htmlFor="form-revision">
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
  const { language, text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const loaded = useQuery({
    queryKey: ["form", id],
    queryFn: () => api.fetchForm(id ?? ""),
    enabled: Boolean(id && !isNew),
  });
  const [draft, setDraft] = useState<CreateFormBody | null>(isNew ? newForm() : null);
  const [selected, setSelected] = useState<number | null>(null);
  const [addType, setAddType] = useState<FormFieldType>("shortText");
  const [problem, setProblem] = useState("");

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
      notify({ tone: "success", message: text("saved") });
      if (isNew) navigate(`/${area.path}/${saved.id}`, { replace: true });
    },
  });

  const submit = () => {
    if (!draft) return;
    const checked = createFormBody.safeParse(draft);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      setProblem(`${text("formInvalid")} ${issue?.path.join(".")}: ${issue?.message}`);
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

  return (
    <>
      <ScreenTitle title={draft?.name || text("formNew")} />
      <HeaderEnd>
        <Button onClick={() => navigate(`/${area.path}`)}>{text("forms")}</Button>
        <Button tone="primary" icon={<FloppyDiskIcon />} disabled={!draft || save.isPending} onClick={submit}>
          {save.isPending ? text("savePending") : text("save")}
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
                  title={draft.name || text("formNew")}
                  meta={draft.fields.length}
                  actions={<Button onClick={() => setSelected(null)}>{text("formSettings")}</Button>}
                />
                <Card.Body>
                  <Reorder.List
                    className="forms-fields"
                    count={draft.fields.length}
                    onMove={(from, to) => {
                      change(reorderFields(draft, from, to));
                      setSelected(to);
                    }}
                  >
                    {draft.fields.map((field, index) => (
                      <Reorder.Item key={field.key} index={index}>
                        <div className="forms-fields__row" data-selected={selected === index || undefined}>
                          <Reorder.Handle
                            index={index}
                            label={text("moveGroup", field.label[language] || field.key)}
                          />
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
                      </Reorder.Item>
                    ))}
                  </Reorder.List>
                </Card.Body>
                <Card.Footer
                  actions={
                    <div className="forms-add">
                      <Select
                        aria-label={text("formField")}
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
                        {text("formFieldAdd")}
                      </Button>
                    </div>
                  }
                />
              </Card>
              <Card>
                <Card.Header title={text("preview")} />
                <Card.Body>
                  <FormPreview fields={draft.fields} />
                </Card.Body>
              </Card>
            </Editor.Main>
            <Editor.Panel
              title={
                selectedField ? selectedField.label[language] || text("formField") : text("formSettings")
              }
              headerActions={<Translated.Switch />}
            >
              {selectedField && selected !== null ? (
                <>
                  <Field label={text("formField")} htmlFor="form-type">
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
                  <Field label={text("formFieldKey")} htmlFor="form-key">
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
                    label={text("formFieldLabel")}
                    value={selectedField.label}
                    onChange={(label) => updateField(selected, { ...selectedField, label })}
                  />
                  <Translated.Field
                    id="form-field-hint"
                    label={text("formFieldHint")}
                    value={selectedField.hint}
                    onChange={(hint) => updateField(selected, { ...selectedField, hint })}
                  />
                  <Field.Inline label={text("formRequired")} htmlFor="form-required">
                    <Switch
                      id="form-required"
                      aria-label={text("formRequired")}
                      checked={selectedField.required}
                      onCheckedChange={(required) => updateField(selected, { ...selectedField, required })}
                    />
                  </Field.Inline>
                  <FieldRules field={selectedField} update={(field) => updateField(selected, field)} />
                  <Button
                    disabled={draft.fields.length <= 1}
                    onClick={() => {
                      change({ ...draft, fields: draft.fields.filter((_, index) => index !== selected) });
                      setSelected(null);
                    }}
                  >
                    {text("formFieldRemove")}
                  </Button>
                </>
              ) : (
                <>
                  <Field label={text("formName")} htmlFor="form-name">
                    <Input
                      id="form-name"
                      value={draft.name}
                      onChange={(event) => change({ ...draft, name: event.target.value })}
                    />
                  </Field>
                  <Field label={text("formSlug")} htmlFor="form-slug">
                    <Input
                      id="form-slug"
                      value={draft.slug}
                      onChange={(event) => change({ ...draft, slug: event.target.value })}
                    />
                  </Field>
                  <Field label={text("formNotification")} htmlFor="form-notification">
                    <Input
                      id="form-notification"
                      type="email"
                      value={draft.notificationEmail ?? ""}
                      onChange={(event) =>
                        change({ ...draft, notificationEmail: event.target.value || null })
                      }
                    />
                  </Field>
                  <Field label={text("formConfirmation")} htmlFor="form-confirmation">
                    <Select
                      id="form-confirmation"
                      value={draft.confirmationEmailField ?? ""}
                      options={[
                        { value: "", label: text("formNoConfirmation") },
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
                    label={text("formSuccess")}
                    value={draft.successMessage}
                    onChange={(successMessage) => change({ ...draft, successMessage })}
                    multiline
                  />
                  <Field.Inline label={text("formStore")} htmlFor="form-store">
                    <Switch
                      id="form-store"
                      aria-label={text("formStore")}
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
