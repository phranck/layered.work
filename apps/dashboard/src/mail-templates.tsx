import type { BilingualText, MailTemplateKind, SaveMailTemplateBody } from "@layered/schemas";
import { Card, Field, FieldHint, Input } from "@layered/ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ActionButton } from "./action-button.js";
import { BackToList, HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import { issueLine } from "./checked-draft.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MailPreview } from "./mail-preview.js";
import {
  checkedTemplate,
  templateDraftOf,
  useMailTemplate,
  useMailTemplates,
  useSaveMailTemplate,
  useTestMailTemplate,
} from "./mail-templates-query.js";
import { MailTestOutcome } from "./mail-test-outcome.js";
import { useNotify } from "./notifications.js";
import { noRows, QueryStates } from "./query-states.js";
import type { DashboardArea } from "./routes.js";
import { Table } from "./table.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";

/**
 * Fixed template kinds, with their editable bilingual content.
 *
 * @param area - The templates' list, whose address each template opens under.
 */
export function MailTemplatesScreen({ area }: { area: DashboardArea }) {
  const navigate = useNavigate();
  const { language, text } = useDashboardLanguage();
  const list = useMailTemplates();
  return (
    <>
      <ScreenTitle title={text("emailTemplates")} />
      <Card>
        <Card.Header title={text("emailTemplates")} meta={list.data?.length} />
        <QueryStates query={list} empty={text("mailTemplatesEmpty")} isEmpty={noRows}>
          {(templates) => (
            <Table
              columns={[
                { kind: "title", label: text("columnName") },
                { kind: "action", label: text("columnAction") },
              ]}
            >
              {templates.map((template) => {
                const open = () => navigate(`/${area.path}/${template.kind}`);
                return (
                  <Table.Row key={template.kind} onOpen={open}>
                    <Table.Cell kind="title">
                      <Table.Title title={template.name[language]} />
                    </Table.Cell>
                    <Table.Actions>
                      <ActionButton.Icon
                        action="edit"
                        label={text("editMailTemplate")}
                        tabIndex={-1}
                        onClick={open}
                      />
                    </Table.Actions>
                  </Table.Row>
                );
              })}
            </Table>
          )}
        </QueryStates>
      </Card>
    </>
  );
}

/**
 * A template editor uses the existing dashboard cards and form controls.
 *
 * @param area - The templates' list, which the way back in the bar leads to.
 */
export function MailTemplateEditorScreen({ area }: { area: DashboardArea }) {
  const { kind } = useParams();
  const templateKind = kind as MailTemplateKind;
  const { language: interfaceLanguage, text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const loaded = useMailTemplate(templateKind);
  const [draft, setDraft] = useState<SaveMailTemplateBody | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (loaded.data) setDraft(templateDraftOf(loaded.data));
  }, [loaded.data]);

  const save = useSaveMailTemplate(templateKind, {
    onError: notifyError,
    onSuccess: () => notify({ tone: "success", message: text("saved") }),
  });

  const checked = () => {
    const outcome = checkedTemplate(draft);
    if ("issue" in outcome) {
      setProblem(issueLine(text("mailTemplateInvalid"), outcome.issue));
      return null;
    }
    setProblem("");
    return outcome.value;
  };

  const change = (field: keyof SaveMailTemplateBody, value: BilingualText) => {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
    setProblem("");
  };

  const title = loaded.data?.name[interfaceLanguage] ?? text("emailTemplates");
  return (
    <>
      <BackToList area={area} title={loaded.isPending ? text("loading") : title} />
      <HeaderEnd>
        <ActionButton
          action="save"
          tone="primary"
          disabled={!draft || save.isPending}
          onClick={() => {
            const value = checked();
            if (value) save.mutate(value);
          }}
        >
          {save.isPending ? text("savePending") : text("save")}
        </ActionButton>
      </HeaderEnd>
      {loaded.isError && <ErrorNotice error={loaded.error} />}
      {problem && <ErrorNotice message={problem} />}
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
  const test = useTestMailTemplate(kind, { onError: notifyError });
  return (
    <>
      <Card>
        <Card.Header title={title} actions={<Translated.Switch />} />
        <Card.Stack>
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
          <FieldHint as="p">
            {text("mailTemplateValues")}:{" "}
            {allowedVariables.map((name) => (
              <code key={name}>{`{{${name}}}`} </code>
            ))}
          </FieldHint>
        </Card.Stack>
      </Card>
      <Card>
        <Card.Header title={text("preview")} />
        <Card.Stack>
          <MailPreview kind={kind} draft={draft} language={language} />
          <Field label={text("mailTemplateRecipient")} htmlFor="mail-test-recipient">
            <Input
              id="mail-test-recipient"
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </Field>
          {test.data && <MailTestOutcome result={test.data} />}
        </Card.Stack>
        <Card.Footer
          actions={
            <ActionButton
              action="send"
              disabled={!recipient || test.isPending}
              onClick={() => {
                const value = checked();
                if (value) test.mutate({ value, language, recipient });
              }}
            >
              {text("mailTemplateTest")}
            </ActionButton>
          }
        />
      </Card>
    </>
  );
}
