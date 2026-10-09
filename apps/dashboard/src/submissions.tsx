import type { FormSubmission, FormSubmissionStatus } from "@layered/schemas";
import { Button, Card, Field, Input, Row, RowList, Select } from "@layered/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import "./submissions.css";

/** What each status of a submission is called in the catalogue. */
const STATUS_TEXT: Record<FormSubmissionStatus, DashboardStringKey> = {
  unread: "submissionUnread",
  read: "submissionRead",
  spam: "submissionSpam",
};

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
  const { language, text } = useDashboardLanguage();
  const { notifyError } = useNotify();
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
      refreshCounts(queryClient),
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
  });

  return (
    <>
      <ScreenTitle title={text("formSubmissions")} />
      <div className="submissions-layout">
        <Card>
          <Card.Header
            title={text("formSubmissions")}
            meta={submissions.data?.length}
            actions={
              form && (
                <Button.Link href={`${__API_BASE__}/forms/${formId}/submissions/export`} download>
                  {text("submissionsExport")}
                </Button.Link>
              )
            }
          />
          <Card.Body className="submissions-controls">
            {forms.isError && <ErrorNotice error={forms.error} />}
            {submissions.isError && <ErrorNotice error={submissions.error} />}
            {forms.data?.length === 0 && <p>{text("formsEmpty")}</p>}
            {forms.data && forms.data.length > 0 && (
              <>
                <Field label={text("submissionForm")} htmlFor="submissions-form">
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
                <Field label={text("submissionsSearch")} htmlFor="submissions-search">
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
              <p>{search ? text("submissionsNoMatch") : text("submissionsEmpty")}</p>
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
                  <Row.Meta>{text(STATUS_TEXT[submission.status])}</Row.Meta>
                </Row.Button>
              ))}
            </RowList.Divided>
          )}
        </Card>
        {selected && form && (
          <Card>
            <Card.Header title={text("submission")} meta={text(STATUS_TEXT[selected.status])} />
            <Card.Body>
              <dl className="submissions-detail">
                <dt>{text("submissionSubmitted")}</dt>
                <dd>{new Date(selected.createdAt).toLocaleString(language === "de" ? "de-AT" : "en-GB")}</dd>
                <dt>{text("submissionOrigin")}</dt>
                <dd>
                  <code>{selected.sourceHash ?? text("submissionOriginUnknown")}</code>
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
                      {text("submissionConsent")} · {consent.revision}
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
                      {text("submissionMarkRead")}
                    </Button>
                  ) : (
                    <Button disabled={changeStatus.isPending} onClick={() => changeStatus.mutate("unread")}>
                      {text("submissionMarkUnread")}
                    </Button>
                  )}
                  {selected.status !== "spam" && (
                    <Button disabled={changeStatus.isPending} onClick={() => changeStatus.mutate("spam")}>
                      {text("submissionMarkSpam")}
                    </Button>
                  )}
                  <Button tone="danger" onClick={() => setConfirmDelete(true)}>
                    {text("submissionDelete")}
                  </Button>
                </>
              }
            />
          </Card>
        )}
      </div>
      {confirmDelete && selected && (
        <ConfirmDialog
          title={text("submissionDeleteTitle")}
          confirm={text("submissionDeleteConfirm")}
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmDelete(false)}
        >
          <p>{text("submissionDeleteBody")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
