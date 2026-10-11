import {
  type BilingualText,
  type MailTemplateKind,
  type SaveMailTemplateBody,
  saveMailTemplateBody,
} from "@layered/schemas";
import { Button, Card, Field, Input } from "@layered/ui";
import { FloppyDiskIcon, PencilSimpleIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MailPreview } from "./mail-preview.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import { Table } from "./table.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";

/** Fixed template kinds, with their editable bilingual content. */
export function MailTemplatesScreen() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const { language, text } = useDashboardLanguage();
  const list = useQuery({ queryKey: queryKeys.mailTemplates, queryFn: api.fetchMailTemplates });
  return (
    <>
      <ScreenTitle title={text("emailTemplates")} />
      <Card>
        <Card.Header title={text("emailTemplates")} meta={list.data?.length} />
        {list.isError && (
          <Card.Body>
            <ErrorNotice error={list.error} />
          </Card.Body>
        )}
        {list.isSuccess && list.data.length === 0 && <Table.Empty>{text("mailTemplatesEmpty")}</Table.Empty>}
        {list.isSuccess && list.data.length > 0 && (
          <Table
            columns={[
              { kind: "title", label: text("columnName") },
              { kind: "action", label: text("columnAction") },
            ]}
          >
            {list.data.map((template) => {
              const open = () => navigate(`/mail-templates/${template.kind}`);
              return (
                <Table.Row key={template.kind} onOpen={open}>
                  <Table.Cell kind="title">
                    <Table.Title title={template.name[language]} />
                  </Table.Cell>
                  <Table.Actions>
                    <Button.Icon
                      label={text("editMailTemplate")}
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

/** A template editor uses the existing dashboard cards and form controls. */
export function MailTemplateEditorScreen() {
  const { kind } = useParams();
  const templateKind = kind as MailTemplateKind;
  const api = useDashboardApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { language: interfaceLanguage, text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const loaded = useQuery({
    queryKey: queryKeys.mailTemplate(templateKind),
    queryFn: async () => (await api.fetchMailTemplates()).find((item) => item.kind === templateKind),
    enabled: Boolean(kind),
  });
  const [draft, setDraft] = useState<SaveMailTemplateBody | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (loaded.data)
      setDraft({ name: loaded.data.name, subject: loaded.data.subject, body: loaded.data.body });
  }, [loaded.data]);

  const save = useMutation({
    mutationFn: (value: SaveMailTemplateBody) => api.saveMailTemplate(templateKind, value),
    onError: (error) => notifyError(error),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.mailTemplate(templateKind), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailTemplates });
      notify({ tone: "success", message: text("saved") });
    },
  });

  const checked = () => {
    const parsed = saveMailTemplateBody.safeParse(draft);
    if (!parsed.success) {
      setProblem(
        `${text("mailTemplateInvalid")} ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`,
      );
      return null;
    }
    setProblem("");
    return parsed.data;
  };

  const change = (field: keyof SaveMailTemplateBody, value: BilingualText) => {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
    setProblem("");
  };

  const title = loaded.data?.name[interfaceLanguage] ?? text("emailTemplates");
  return (
    <>
      <ScreenTitle title={title} />
      <HeaderEnd>
        <Button onClick={() => navigate("/mail-templates")}>{text("emailTemplates")}</Button>
        <Button
          tone="primary"
          icon={<FloppyDiskIcon />}
          disabled={!draft || save.isPending}
          onClick={() => {
            const value = checked();
            if (value) save.mutate(value);
          }}
        >
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
          <MailTemplateCards
            kind={templateKind}
            title={title}
            allowedVariables={loaded.data?.allowedVariables ?? []}
            draft={draft}
            onChange={change}
            checked={checked}
          />
        </Translated>
      )}
    </>
  );
}

/**
 * The template's texts and its preview, in the language the switch has chosen.
 *
 * The preview and the test message go out in that language too, so what is
 * edited is what is tried.
 *
 * @param kind - Which template.
 * @param title - The template's name, for the card.
 * @param allowedVariables - The placeholders the template may hold.
 * @param draft - The template as edited.
 * @param onChange - Replaces one of its bilingual texts.
 * @param checked - The draft if it is valid, after saying why where it is not.
 */
function MailTemplateCards({
  kind,
  title,
  allowedVariables,
  draft,
  onChange,
  checked,
}: {
  kind: MailTemplateKind;
  title: string;
  allowedVariables: readonly string[];
  draft: SaveMailTemplateBody;
  onChange: (field: keyof SaveMailTemplateBody, value: BilingualText) => void;
  checked: () => SaveMailTemplateBody | null;
}) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const language = useTextLanguage();
  const [recipient, setRecipient] = useState("");
  // The placeholders as the editor completes and checks them. Kept while the
  // list is the same, because a new list makes the editor check the body again.
  const placeholders = useMemo(
    () => allowedVariables.map((name) => ({ name, value: "" })),
    [allowedVariables],
  );
  const test = useMutation({
    mutationFn: (value: SaveMailTemplateBody) => api.testMailTemplate(kind, value, language, recipient),
    onError: (error) => notifyError(error),
  });
  return (
    <>
      <Card>
        <Card.Header title={title} actions={<Translated.Switch />} />
        <Card.Body>
          <Translated.Field
            id="mail-name"
            label={text("mailTemplateName")}
            value={draft.name}
            onChange={(value) => onChange("name", value)}
          />
          <Translated.Field
            id="mail-subject"
            label={text("mailTemplateSubject")}
            value={draft.subject}
            onChange={(value) => onChange("subject", value)}
          />
          <Translated.Field
            id="mail-body"
            label={text("mailTemplateBody")}
            value={draft.body}
            profile="mail"
            values={placeholders}
            onChange={(value) => onChange("body", value)}
          />
          <p>
            {text("mailTemplateValues")}:{" "}
            {allowedVariables.map((name) => (
              <code key={name}>{`{{${name}}}`} </code>
            ))}
          </p>
        </Card.Body>
      </Card>
      <Card>
        <Card.Header title={text("preview")} />
        <Card.Body>
          <MailPreview kind={kind} draft={draft} language={language} />
          <Field label={text("mailTemplateRecipient")} htmlFor="mail-test-recipient">
            <Input
              id="mail-test-recipient"
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </Field>
          <Button
            disabled={!recipient || test.isPending}
            onClick={() => {
              const value = checked();
              if (value) test.mutate(value);
            }}
          >
            {text("mailTemplateTest")}
          </Button>
          {test.data && (
            <p role="status">
              {test.data.accepted ? text("mailTemplateAccepted") : text("mailTemplateRefused")}{" "}
              {test.data.answer}
            </p>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
