import type { FormSubmission, FormSubmissionStatus } from "@layered/schemas";
import { Button, Card, Field, Input, Row, RowList, Select } from "@layered/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import "./submissions.css";

const words = {
  en: {
    title: "Submissions",
    form: "Form",
    search: "Search submissions",
    emptyForms: "No forms yet.",
    empty: "No submissions for this form.",
    noMatches: "No submissions match your search.",
    export: "Export CSV",
    detail: "Submission",
    origin: "Origin fingerprint",
    submitted: "Submitted",
    consent: "Consent",
    unread: "Unread",
    read: "Read",
    spam: "Spam",
    markRead: "Mark read",
    markUnread: "Mark unread",
    markSpam: "Mark spam",
    delete: "Delete submission",
    deleteTitle: "Delete submission?",
    deleteWarning: "This permanently deletes the submission and cannot be undone.",
    deleteConfirm: "Delete permanently",
    cancel: "Cancel",
    unknown: "Unknown",
  },
  de: {
    title: "Einsendungen",
    form: "Formular",
    search: "Einsendungen suchen",
    emptyForms: "Noch keine Formulare.",
    empty: "Für dieses Formular gibt es noch keine Einsendungen.",
    noMatches: "Keine Einsendung passt zur Suche.",
    export: "CSV exportieren",
    detail: "Einsendung",
    origin: "Herkunftsfingerabdruck",
    submitted: "Eingegangen",
    consent: "Einwilligung",
    unread: "Ungelesen",
    read: "Gelesen",
    spam: "Spam",
    markRead: "Als gelesen markieren",
    markUnread: "Als ungelesen markieren",
    markSpam: "Als Spam markieren",
    delete: "Einsendung löschen",
    deleteTitle: "Einsendung löschen?",
    deleteWarning: "Diese Einsendung wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.",
    deleteConfirm: "Endgültig löschen",
    cancel: "Abbrechen",
    unknown: "Unbekannt",
  },
} as const;

const preview = (submission: FormSubmission): string =>
  Object.values(submission.values)
    .map((value) => (Array.isArray(value) ? value.join(", ") : value))
    .find(Boolean)
    ?.slice(0, 120) ?? "";

const displayValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value.join(", ") : (value ?? "");

/** An inbox for one form at a time, using the dashboard's card and row compounds. */
export function SubmissionsScreen({ area: _area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { language } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const w = words[language];
  const [selectedFormId, setSelectedFormId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const forms = useQuery({ queryKey: ["forms"], queryFn: api.fetchForms });
  const formId = selectedFormId || forms.data?.[0]?.id || "";
  const form = forms.data?.find((item) => item.id === formId);
  const submissionsKey = ["form-submissions", formId] as const;
  const submissions = useQuery({
    queryKey: submissionsKey,
    queryFn: () => api.fetchFormSubmissions(formId),
    enabled: Boolean(formId),
    refetchInterval: 1000,
  });
  const selected = submissions.data?.find((item) => item.id === selectedId);
  const matches = submissions.data?.filter((submission) => {
    const needle = search.trim().toLocaleLowerCase(language);
    if (!needle) return true;
    return [submission.status, submission.sourceHash ?? "", ...Object.values(submission.values).flat()]
      .join(" ")
      .toLocaleLowerCase(language)
      .includes(needle);
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: submissionsKey }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-counts"] }),
    ]);
  };
  const changeStatus = useMutation({
    mutationFn: (status: FormSubmissionStatus) =>
      api.setFormSubmissionStatus(formId, selectedId ?? "", status),
    onSuccess: refresh,
    onError: (error) => notifyError(error),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteFormSubmission(formId, selectedId ?? ""),
    onSuccess: async () => {
      setSelectedId(null);
      setConfirmDelete(false);
      await refresh();
    },
    onError: (error) => notifyError(error),
  });

  return (
    <>
      <ScreenTitle title={w.title} />
      <div className="submissions-layout">
        <Card>
          <Card.Header
            title={w.title}
            meta={submissions.data?.length}
            actions={
              form && (
                <Button.Link href={`${__API_BASE__}/forms/${formId}/submissions/export`} download>
                  {w.export}
                </Button.Link>
              )
            }
          />
          <Card.Body className="submissions-controls">
            {forms.isError && <ErrorNotice error={forms.error} />}
            {submissions.isError && <ErrorNotice error={submissions.error} />}
            {forms.data?.length === 0 && <p>{w.emptyForms}</p>}
            {forms.data && forms.data.length > 0 && (
              <>
                <Field label={w.form} htmlFor="submissions-form">
                  <Select
                    id="submissions-form"
                    options={forms.data.map((item) => ({ value: item.id, label: item.name }))}
                    value={formId}
                    onChange={(event) => {
                      setSelectedFormId(event.target.value);
                      setSelectedId(null);
                      setSearch("");
                    }}
                  />
                </Field>
                <Field label={w.search} htmlFor="submissions-search">
                  <Input
                    id="submissions-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </Field>
              </>
            )}
          </Card.Body>
          {matches && matches.length === 0 && (
            <Card.Body>
              <p>{search ? w.noMatches : w.empty}</p>
            </Card.Body>
          )}
          {matches && matches.length > 0 && (
            <RowList.Divided>
              {matches.map((submission) => (
                <Row.Button
                  key={submission.id}
                  className="submissions-row"
                  data-status={submission.status}
                  aria-current={selectedId === submission.id ? "true" : undefined}
                  onClick={() => setSelectedId(submission.id)}
                >
                  <Row.Text
                    title={preview(submission)}
                    note={new Date(submission.createdAt).toLocaleString(
                      language === "de" ? "de-AT" : "en-GB",
                    )}
                  />
                  <Row.Meta>{w[submission.status]}</Row.Meta>
                </Row.Button>
              ))}
            </RowList.Divided>
          )}
        </Card>
        {selected && form && (
          <Card>
            <Card.Header title={w.detail} meta={w[selected.status]} />
            <Card.Body>
              <dl className="submissions-detail">
                <dt>{w.submitted}</dt>
                <dd>{new Date(selected.createdAt).toLocaleString(language === "de" ? "de-AT" : "en-GB")}</dd>
                <dt>{w.origin}</dt>
                <dd>
                  <code>{selected.sourceHash ?? w.unknown}</code>
                </dd>
                {Object.entries(selected.values).map(([key, value]) => (
                  <div key={key} className="submissions-detail__field">
                    <dt>{form.fields.find((field) => field.key === key)?.label[language] ?? key}</dt>
                    <dd>{displayValue(value)}</dd>
                  </div>
                ))}
                {selected.consents.map((consent) => (
                  <div key={consent.key} className="submissions-detail__field">
                    <dt>
                      {w.consent} · {consent.revision}
                    </dt>
                    <dd>{consent.notice}</dd>
                  </div>
                ))}
              </dl>
            </Card.Body>
            <Card.Footer
              actions={
                <>
                  {selected.status === "unread" ? (
                    <Button disabled={changeStatus.isPending} onClick={() => changeStatus.mutate("read")}>
                      {w.markRead}
                    </Button>
                  ) : (
                    <Button disabled={changeStatus.isPending} onClick={() => changeStatus.mutate("unread")}>
                      {w.markUnread}
                    </Button>
                  )}
                  {selected.status !== "spam" && (
                    <Button disabled={changeStatus.isPending} onClick={() => changeStatus.mutate("spam")}>
                      {w.markSpam}
                    </Button>
                  )}
                  <Button tone="danger" onClick={() => setConfirmDelete(true)}>
                    {w.delete}
                  </Button>
                </>
              }
            />
          </Card>
        )}
      </div>
      {confirmDelete && selected && (
        <CardDialog labelId="delete-submission-title" onClose={() => setConfirmDelete(false)}>
          <Card.Header id="delete-submission-title" title={w.deleteTitle} />
          <Card.Body>
            <p>{w.deleteWarning}</p>
          </Card.Body>
          <Card.Footer
            actions={
              <>
                <Button onClick={() => setConfirmDelete(false)} autoFocus>
                  {w.cancel}
                </Button>
                <Button tone="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  {w.deleteConfirm}
                </Button>
              </>
            }
          />
        </CardDialog>
      )}
    </>
  );
}
