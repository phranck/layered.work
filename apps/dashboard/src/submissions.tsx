import type { FormSubmission, FormSubmissionStatus } from "@layered/schemas";
import { Button, Card, Select } from "@layered/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { DataTable, useTableSearch } from "./data-table.js";
import { ErrorNotice } from "./error-notice.js";
import { DATE_FORMAT, DATE_TIME_FORMAT } from "./format.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
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
  const field = useTableSearch();
  const forms = useQuery({ queryKey: queryKeys.forms, queryFn: api.fetchForms });
  const formId = selectedFormId || forms.data?.[0]?.id || "";
  const form = forms.data?.find((item) => item.id === formId);
  const submissions = useQuery({
    queryKey: queryKeys.formSubmissions(formId),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.formSubmissions(formId) }),
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
              forms.data &&
              forms.data.length > 0 && (
                <>
                  <DataTable.Search
                    label={text("submissionsSearch")}
                    value={search}
                    onChange={setSearch}
                    search={field}
                  />
                  <Select
                    aria-label={text("submissionForm")}
                    options={forms.data.map((item) => ({ value: item.id, label: item.name }))}
                    value={formId}
                    onChange={(event) => {
                      setSelectedFormId(event.target.value);
                      setSelectedId(null);
                      setSearch("");
                    }}
                  />
                  {form && (
                    <Button.Link href={`${__API_BASE__}/forms/${formId}/submissions/export`} download>
                      {text("submissionsExport")}
                    </Button.Link>
                  )}
                </>
              )
            }
          />
          {(forms.isError || submissions.isError || forms.data?.length === 0) && (
            <Card.Body>
              {forms.isError && <ErrorNotice error={forms.error} />}
              {submissions.isError && <ErrorNotice error={submissions.error} />}
              {forms.data?.length === 0 && <p>{text("formsEmpty")}</p>}
            </Card.Body>
          )}
          {matches && matches.length === 0 && (
            <Card.Body>
              <p>{search ? text("submissionsNoMatch") : text("submissionsEmpty")}</p>
            </Card.Body>
          )}
          {matches && matches.length > 0 && (
            <DataTable
              bodyRef={field.bodyRef}
              onLeaveTop={field.onLeaveTop}
              columns={[
                { kind: "title", label: text("submission") },
                { kind: "state", label: text("columnState") },
                { kind: "date", label: text("columnDate") },
              ]}
            >
              {matches.map((submission) => (
                <DataTable.Row
                  key={submission.id}
                  active={selectedId === submission.id}
                  onOpen={() => setSelectedId(submission.id)}
                >
                  <DataTable.Cell kind="title">
                    <DataTable.Title title={preview(submission)} />
                  </DataTable.Cell>
                  <DataTable.Cell kind="state">{text(STATUS_TEXT[submission.status])}</DataTable.Cell>
                  <DataTable.Cell kind="date">
                    <time dateTime={submission.createdAt}>
                      {DATE_FORMAT[language].format(new Date(submission.createdAt))}
                    </time>
                  </DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable>
          )}
        </Card>
        {selected && form && (
          <Card>
            <Card.Header title={text("submission")} meta={text(STATUS_TEXT[selected.status])} />
            <Card.Body>
              <dl className="submissions-detail">
                <dt>{text("submissionSubmitted")}</dt>
                <dd>
                  <time dateTime={selected.createdAt}>
                    {DATE_TIME_FORMAT[language].format(new Date(selected.createdAt))}
                  </time>
                </dd>
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
