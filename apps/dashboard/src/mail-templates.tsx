import { type MailTemplateKind, type SaveMailTemplateBody, saveMailTemplateBody } from "@layered/schemas";
import { Button, Card, Field, Input, Select, Textarea } from "@layered/ui";
import { FloppyDiskIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createElement, type ReactNode, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";

const labels = {
  en: {
    title: "Email templates",
    back: "Email templates",
    save: "Save",
    saving: "Saving…",
    saved: "Template saved",
    name: "Name",
    subject: "Subject",
    body: "Body",
    values: "Available values",
    preview: "Preview",
    test: "Send test",
    recipient: "Test recipient",
    html: "HTML",
    plain: "Plain text",
    invalid: "Check the template:",
    accepted: "SMTP2GO accepted the test message.",
    refused: "SMTP2GO refused the test message.",
    empty: "No templates available.",
  },
  de: {
    title: "E-Mail-Vorlagen",
    back: "E-Mail-Vorlagen",
    save: "Speichern",
    saving: "Speichert…",
    saved: "Vorlage gespeichert",
    name: "Name",
    subject: "Betreff",
    body: "Inhalt",
    values: "Verfügbare Werte",
    preview: "Vorschau",
    test: "Test senden",
    recipient: "Testempfänger",
    html: "HTML",
    plain: "Klartext",
    invalid: "Vorlage prüfen:",
    accepted: "SMTP2GO hat die Testnachricht angenommen.",
    refused: "SMTP2GO hat die Testnachricht abgewiesen.",
    empty: "Keine Vorlagen verfügbar.",
  },
} as const;

const MAIL_TAGS = new Set(["div", "p", "strong", "em", "ul", "ol", "li", "a", "br"]);

/** Rebuild the API's preview with email-safe tags rather than injecting HTML. */
function SafeMailPreview({ html }: { html: string }) {
  const document = new DOMParser().parseFromString(html, "text/html");
  function nodeToReact(node: ChildNode, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof Element)) return null;
    const tag = node.tagName.toLowerCase();
    if (!MAIL_TAGS.has(tag)) return null;
    const props: Record<string, unknown> = { key };
    if (tag === "a") {
      const href = node.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) return null;
      props.href = href;
      props.rel = "noopener noreferrer";
    }
    if (tag === "div" && ["en", "de"].includes(node.getAttribute("lang") ?? "")) {
      props.lang = node.getAttribute("lang");
    }
    return createElement(tag, props, ...Array.from(node.childNodes).map(nodeToReact));
  }
  return <div>{Array.from(document.body.childNodes).map(nodeToReact)}</div>;
}

/** Fixed template kinds, with their editable bilingual content. */
export function MailTemplatesScreen() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const { language } = useDashboardLanguage();
  const words = labels[language];
  const list = useQuery({ queryKey: ["mail-templates"], queryFn: api.fetchMailTemplates });
  return (
    <>
      <ScreenTitle title={words.title} />
      <Card>
        <Card.Header title={words.title} meta={list.data?.length} />
        {list.isError && (
          <Card.Body>
            <ErrorNotice error={list.error} />
          </Card.Body>
        )}
        {list.isSuccess && list.data.length === 0 && (
          <Card.Body>
            <p>{words.empty}</p>
          </Card.Body>
        )}
        {list.isSuccess && list.data.length > 0 && (
          <Card.Body>
            {list.data.map((template) => (
              <p key={template.kind}>
                <Button onClick={() => navigate(`/mail-templates/${template.kind}`)}>
                  {template.name[language]}
                </Button>
              </p>
            ))}
          </Card.Body>
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
  const { language: interfaceLanguage } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const words = labels[interfaceLanguage];
  const loaded = useQuery({
    queryKey: ["mail-template", templateKind],
    queryFn: async () => (await api.fetchMailTemplates()).find((item) => item.kind === templateKind),
    enabled: Boolean(kind),
  });
  const [draft, setDraft] = useState<SaveMailTemplateBody | null>(null);
  const [language, setLanguage] = useState<"en" | "de">(interfaceLanguage);
  const [recipient, setRecipient] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (loaded.data)
      setDraft({ name: loaded.data.name, subject: loaded.data.subject, body: loaded.data.body });
  }, [loaded.data]);

  const save = useMutation({
    mutationFn: (value: SaveMailTemplateBody) => api.saveMailTemplate(templateKind, value),
    onError: (error) => notifyError(error),
    onSuccess: (saved) => {
      queryClient.setQueryData(["mail-template", templateKind], saved);
      void queryClient.invalidateQueries({ queryKey: ["mail-templates"] });
      notify({ tone: "success", message: words.saved });
    },
  });
  const preview = useMutation({
    mutationFn: (value: SaveMailTemplateBody) => api.previewMailTemplate(templateKind, value, language),
    onError: (error) => notifyError(error),
  });
  const test = useMutation({
    mutationFn: (value: SaveMailTemplateBody) =>
      api.testMailTemplate(templateKind, value, language, recipient),
    onError: (error) => notifyError(error),
  });

  const checked = () => {
    const parsed = saveMailTemplateBody.safeParse(draft);
    if (!parsed.success) {
      setProblem(
        `${words.invalid} ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`,
      );
      return null;
    }
    setProblem("");
    return parsed.data;
  };

  const change = (field: keyof SaveMailTemplateBody, lang: "en" | "de", value: string) => {
    if (!draft) return;
    setDraft({ ...draft, [field]: { ...draft[field], [lang]: value } });
    setProblem("");
  };

  return (
    <>
      <ScreenTitle title={loaded.data?.name[interfaceLanguage] ?? words.title} />
      <HeaderEnd>
        <Button onClick={() => navigate("/mail-templates")}>{words.back}</Button>
        <Button
          tone="primary"
          icon={<FloppyDiskIcon />}
          disabled={!draft || save.isPending}
          onClick={() => {
            const value = checked();
            if (value) save.mutate(value);
          }}
        >
          {save.isPending ? words.saving : words.save}
        </Button>
      </HeaderEnd>
      {loaded.isError && <ErrorNotice error={loaded.error} />}
      {problem && (
        <p role="alert" className="dashboard-error">
          {problem}
        </p>
      )}
      {draft && (
        <>
          <Card>
            <Card.Header title={loaded.data?.name[interfaceLanguage] ?? words.title} />
            <Card.Body>
              {(["en", "de"] as const).map((lang) => (
                <div key={lang} lang={lang}>
                  <h3>{lang.toUpperCase()}</h3>
                  <Field label={`${words.name} (${lang.toUpperCase()})`} htmlFor={`mail-name-${lang}`}>
                    <Input
                      id={`mail-name-${lang}`}
                      value={draft.name[lang]}
                      onChange={(event) => change("name", lang, event.target.value)}
                    />
                  </Field>
                  <Field label={`${words.subject} (${lang.toUpperCase()})`} htmlFor={`mail-subject-${lang}`}>
                    <Input
                      id={`mail-subject-${lang}`}
                      value={draft.subject[lang]}
                      onChange={(event) => change("subject", lang, event.target.value)}
                    />
                  </Field>
                  <Field label={`${words.body} (${lang.toUpperCase()})`} htmlFor={`mail-body-${lang}`}>
                    <Textarea
                      id={`mail-body-${lang}`}
                      value={draft.body[lang]}
                      onChange={(event) => change("body", lang, event.target.value)}
                      rows={8}
                    />
                  </Field>
                </div>
              ))}
              <p>
                {words.values}:{" "}
                {loaded.data?.allowedVariables.map((name) => (
                  <code key={name}>{`{{${name}}}`} </code>
                ))}
              </p>
            </Card.Body>
          </Card>
          <Card>
            <Card.Header title={words.preview} />
            <Card.Body>
              <Field label="Language / Sprache" htmlFor="mail-preview-language">
                <Select
                  id="mail-preview-language"
                  value={language}
                  options={[
                    { value: "en", label: "English" },
                    { value: "de", label: "Deutsch" },
                  ]}
                  onChange={(event) => setLanguage(event.target.value as "en" | "de")}
                />
              </Field>
              <Button
                onClick={() => {
                  const value = checked();
                  if (value) preview.mutate(value);
                }}
              >
                {words.preview}
              </Button>
              {preview.data && (
                <>
                  <p>
                    {words.subject}: {preview.data.subject}
                  </p>
                  <h3>{words.html}</h3>
                  <SafeMailPreview html={preview.data.html} />
                  <h3>{words.plain}</h3>
                  <pre>{preview.data.text}</pre>
                </>
              )}
              <Field label={words.recipient} htmlFor="mail-test-recipient">
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
                {words.test}
              </Button>
              {test.data && (
                <p role="status">
                  {test.data.accepted ? words.accepted : words.refused} {test.data.answer}
                </p>
              )}
            </Card.Body>
          </Card>
        </>
      )}
    </>
  );
}
