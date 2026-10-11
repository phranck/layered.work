import { formFields, submittedValueText } from "@layered/schemas";
import { Button, Card, Select } from "@layered/ui";
import {
  DownloadSimpleIcon,
  EnvelopeOpenIcon,
  EnvelopeSimpleIcon,
  TrashIcon,
  WarningOctagonIcon,
} from "@layered/ui/icons";
import { useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { ErrorNotice } from "./error-notice.js";
import { DATE_FORMAT, DATE_TIME_FORMAT } from "./format.js";
import { useForms } from "./forms-query.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import {
  filterSubmissions,
  SUBMISSION_STATUS_TEXT,
  SUBMISSION_STATUS_TONE,
  submissionPreview,
  useDeleteSubmission,
  useFormSubmissions,
  useSetSubmissionStatus,
} from "./submissions-query.js";
import { Table, useTableSearch } from "./table.js";
import "./submissions.css";

/** An inbox for one form at a time, using the dashboard's card and row compounds. */
export function SubmissionsScreen({ area: _area }: { area: DashboardArea }) {
  const { language, text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const [selectedFormId, setSelectedFormId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const field = useTableSearch();
  const forms = useForms();
  const formId = selectedFormId || forms.data?.[0]?.id || "";
  const form = forms.data?.find((item) => item.id === formId);
  const submissions = useFormSubmissions(formId);
  const selected = submissions.data?.find((item) => item.id === selectedId);
  const matches = submissions.data && filterSubmissions(submissions.data, search, language);
  const changeStatus = useSetSubmissionStatus(formId, { onError: notifyError });
  const remove = useDeleteSubmission(formId, {
    onSuccess: () => {
      setSelectedId(null);
      setConfirmDelete(false);
    },
  });

  return (
    <>
      <ScreenTitle title={text("formSubmissions")} />
      <div className="submissions-layout" data-open={selected && form ? "" : undefined}>
        <Card>
          <Card.Header
            title={text("formSubmissions")}
            meta={submissions.data?.length}
            actions={
              forms.data &&
              forms.data.length > 0 && (
                <>
                  <Table.Search
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
                    <Button.Link
                      href={`${__API_BASE__}/forms/${formId}/submissions/export`}
                      download
                      icon={<DownloadSimpleIcon />}
                    >
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
            <Table.Empty>{search ? text("submissionsNoMatch") : text("submissionsEmpty")}</Table.Empty>
          )}
          {matches && matches.length > 0 && (
            <Table
              bodyRef={field.bodyRef}
              onLeaveTop={field.onLeaveTop}
              columns={[
                { kind: "title", label: text("submission") },
                { kind: "state", label: text("columnState") },
                { kind: "date", label: text("columnDate") },
              ]}
            >
              {matches.map((submission) => (
                <Table.Row
                  key={submission.id}
                  active={selectedId === submission.id}
                  onOpen={() => setSelectedId(submission.id)}
                >
                  <Table.Cell kind="title">
                    <Table.Title title={submissionPreview(submission)} />
                  </Table.Cell>
                  <Table.Cell kind="state">
                    <Table.Badge tone={SUBMISSION_STATUS_TONE[submission.status]}>
                      {text(SUBMISSION_STATUS_TEXT[submission.status])}
                    </Table.Badge>
                  </Table.Cell>
                  <Table.Cell kind="date">
                    <time dateTime={submission.createdAt}>
                      {DATE_FORMAT[language].format(new Date(submission.createdAt))}
                    </time>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table>
          )}
        </Card>
        {selected && form && (
          <Card>
            <Card.Header title={text("submission")} meta={text(SUBMISSION_STATUS_TEXT[selected.status])} />
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
                    <dt>{formFields(form).find((field) => field.key === key)?.label[language] ?? key}</dt>
                    <dd>{submittedValueText(value)}</dd>
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
                    <Button
                      icon={<EnvelopeOpenIcon />}
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ submissionId: selected.id, status: "read" })}
                    >
                      {text("submissionMarkRead")}
                    </Button>
                  ) : (
                    <Button
                      icon={<EnvelopeSimpleIcon />}
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ submissionId: selected.id, status: "unread" })}
                    >
                      {text("submissionMarkUnread")}
                    </Button>
                  )}
                  {selected.status !== "spam" && (
                    <Button
                      icon={<WarningOctagonIcon />}
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ submissionId: selected.id, status: "spam" })}
                    >
                      {text("submissionMarkSpam")}
                    </Button>
                  )}
                  <Button tone="danger" icon={<TrashIcon />} onClick={() => setConfirmDelete(true)}>
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
          onConfirm={() => remove.mutate(selected.id)}
          onClose={() => setConfirmDelete(false)}
        >
          <p>{text("submissionDeleteBody")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
