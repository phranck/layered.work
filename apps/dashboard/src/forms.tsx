import {
  type CreateFormBody,
  createFormBody,
  FORM_COLUMNS,
  FORM_FIELD_COUNT,
  FORM_FIELD_TYPES,
  FORM_OPTION_COUNT,
  type FormField,
  type FormFieldType,
  fieldSpan,
  formFields,
} from "@layered/schemas";
import { Button, Card, Editor, Field, FormEmbed, Input, Select, Switch } from "@layered/ui";
import { FloppyDiskIcon, PencilSimpleIcon, PlusIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { ErrorNotice } from "./error-notice.js";
import { FormBuilder } from "./forms-builder.js";
import {
  FIELD_TYPE_TEXT,
  type FieldPlace,
  fieldAt,
  newField,
  newForm,
  newOption,
  removeField,
  replaceField,
  setFieldSpan,
  widestSpan,
} from "./forms-model.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import type { DashboardArea } from "./routes.js";
import { Table } from "./table.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";
import "./forms.css";

/** The list follows the same card and app-bar pattern as the entry lists. */
export function FormsScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const { text } = useDashboardLanguage();
  const list = useQuery({ queryKey: queryKeys.forms, queryFn: api.fetchForms });
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
        {list.isSuccess && list.data.length === 0 && <Table.Empty>{text("formsEmpty")}</Table.Empty>}
        {list.isSuccess && list.data.length > 0 && (
          <Table
            columns={[
              { kind: "title", label: text("columnName") },
              { kind: "text", label: text("formSlug") },
              { kind: "count", label: text("columnFields") },
              { kind: "action", label: text("columnAction") },
            ]}
          >
            {list.data.map((form) => {
              const open = () => navigate(`/${area.path}/${form.id}`);
              return (
                <Table.Row key={form.id} onOpen={open}>
                  <Table.Cell kind="title">
                    <Table.Title title={form.name} />
                  </Table.Cell>
                  <Table.Cell>{form.slug}</Table.Cell>
                  <Table.Cell kind="count">{formFields(form).length}</Table.Cell>
                  <Table.Actions>
                    <Button.Icon
                      label={text("editForm")}
                      icon={<PencilSimpleIcon />}
                      tabIndex={-1}
                      onClick={open}
                    />
                  </Table.Actions>
                </Table.Row>
              );
            })}
          </Table>
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
                    options: field.options.map((item, position) =>
                      position === index ? { ...item, value: event.target.value } : item,
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
                  options: field.options.map((item, position) =>
                    position === index ? { ...item, label } : item,
                  ),
                })
              }
            />
            <Button
              disabled={field.options.length <= FORM_OPTION_COUNT.min}
              onClick={() =>
                update({ ...field, options: field.options.filter((_, position) => position !== index) })
              }
            >
              {text("formOptionRemove", index + 1)}
            </Button>
          </div>
        ))}
        <Button
          disabled={field.options.length >= FORM_OPTION_COUNT.max}
          onClick={() => update({ ...field, options: [...field.options, newOption(field.options)] })}
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
          profile="inline"
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

/**
 * A field's width, one step per column of its row, filled up to the width it
 * has. A step wider than the other fields of the row leave cannot be pressed,
 * so a row never holds more than its columns.
 *
 * @param span - The columns the field takes.
 * @param widest - The most it may take beside the other fields of its row.
 * @param onChange - Called with the width pressed.
 */
function SpanControl({
  span,
  widest,
  onChange,
}: {
  span: number;
  widest: number;
  onChange: (span: number) => void;
}) {
  const { text } = useDashboardLanguage();
  return (
    <Field label={text("formFieldWidth")} hint={text("formSpanOf", span, FORM_COLUMNS)}>
      {/* biome-ignore lint/a11y/useSemanticElements: A group of toggle buttons, like the segmented control, where a fieldset would add browser layout to the grid. */}
      <div
        className="forms-span"
        role="group"
        aria-label={text("formFieldWidth")}
        style={{ "--columns": FORM_COLUMNS } as CSSProperties}
      >
        {Array.from({ length: FORM_COLUMNS }, (_, index) => index + 1).map((step) => (
          <button
            key={step}
            type="button"
            className="forms-span__step"
            aria-label={text("formSpanOf", step, FORM_COLUMNS)}
            aria-pressed={step === span}
            data-filled={step <= span || undefined}
            disabled={step > widest}
            onClick={() => onChange(step)}
          />
        ))}
      </div>
    </Field>
  );
}

/**
 * One form in the Editor layout: the builder and the site's own preview in the
 * main column, and in the panel either the selected field's settings or, with
 * nothing selected, the form's.
 */
export function FormEditorScreen({ area }: { area: DashboardArea }) {
  const { id } = useParams();
  const isNew = id === "new";
  const api = useDashboardApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { language, text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const loaded = useQuery({
    queryKey: queryKeys.form(id),
    queryFn: () => api.fetchForm(id ?? ""),
    enabled: Boolean(id && !isNew),
  });
  const [draft, setDraft] = useState<CreateFormBody | null>(isNew ? newForm(text("formNew")) : null);
  const [selected, setSelected] = useState<FieldPlace | null>(null);
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
        rows,
      } = loaded.data;
      setDraft({
        slug,
        name,
        notificationEmail,
        confirmationEmailField: confirmationEmailField ?? null,
        successMessage,
        storeSubmissions,
        rows,
      });
    }
  }, [loaded.data]);

  const save = useMutation({
    mutationFn: (value: CreateFormBody) => (isNew ? api.createForm(value) : api.saveForm(id ?? "", value)),
    onError: (error) => notifyError(error),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.form(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.forms });
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
  const updateField = (place: FieldPlace, field: FormField) => {
    if (!draft) return;
    change(replaceField(draft, place, field));
  };
  const fields = draft ? formFields(draft) : [];
  const selectedField = draft && selected ? fieldAt(draft, selected) : undefined;
  const typeOptions = FORM_FIELD_TYPES.map((type) => ({ value: type, label: text(FIELD_TYPE_TEXT[type]) }));

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
              <FormBuilder
                form={draft}
                selected={selected}
                onSelect={setSelected}
                onChange={(next, place) => {
                  change(next);
                  setSelected(place);
                }}
                header={
                  <Card.Header
                    title={draft.name || text("formNew")}
                    meta={fields.length}
                    actions={<Button onClick={() => setSelected(null)}>{text("formSettings")}</Button>}
                  />
                }
              >
                <Card>
                  <Card.Header title={text("preview")} />
                  <Card.Body>
                    <FormPreview form={draft} />
                  </Card.Body>
                </Card>
              </FormBuilder>
            </Editor.Main>
            <Editor.Panel
              title={
                selectedField ? selectedField.label[language] || text("formField") : text("formSettings")
              }
              headerActions={<Translated.Switch />}
            >
              {selectedField && selected ? (
                <>
                  <Field label={text("formField")} htmlFor="form-type">
                    <Select
                      id="form-type"
                      value={selectedField.type}
                      options={typeOptions}
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
                  <SpanControl
                    span={fieldSpan(selectedField)}
                    widest={widestSpan(draft, selected)}
                    onChange={(span) => change(setFieldSpan(draft, selected, span))}
                  />
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
                    disabled={fields.length <= FORM_FIELD_COUNT.min}
                    onClick={() => {
                      change(removeField(draft, selected));
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
                        ...fields
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
                    profile="inline"
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
 * The form as a visitor sees it: the site's own form component in preview mode,
 * inside the site's content scope and at the site's density, in the language
 * the panel's switch has chosen, so the texts being edited show where they will
 * appear and at the size they will have.
 *
 * @param form - The form as drafted.
 */
function FormPreview({ form }: { form: CreateFormBody }) {
  return (
    <div className="site-scope content-prose forms-preview">
      <FormEmbed form={form} language={useTextLanguage()} preview />
    </div>
  );
}
