import { formFields, submittedValueText } from "@layered/schemas";
import { Badge, Card, FieldLabel, Select } from "@layered/ui";
import { useState } from "react";
import { ActionButton } from "./action-button.js";
import { ScreenTitle } from "./app-bar-slots.js";
import { useForms } from "./forms-query.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { EmptyState, noRows, QueryStates } from "./query-states.js";
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
import { Timestamp } from "./timestamp.js";
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
                    <ActionButton.Link
                      action="download"
                      href={`${__API_BASE__}/forms/${formId}/submissions/export`}
                      download
                    >
                      {text("submissionsExport")}
                    </ActionButton.Link>
                  )}
                </>
              )
            }
          />
          <QueryStates query={forms} empty={text("formsEmpty")} isEmpty={noRows}>
            {() => (
              <QueryStates query={submissions} empty={text("submissionsEmpty")} isEmpty={noRows}>
                {(all) => {
                  const matches = filterSubmissions(all, search, language);
                  return matches.length === 0 ? (
                    <EmptyState>{text("submissionsNoMatch")}</EmptyState>
                  ) : (
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
                            <Badge tone={SUBMISSION_STATUS_TONE[submission.status]}>
                              {text(SUBMISSION_STATUS_TEXT[submission.status])}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell kind="date">
                            <Timestamp at={submission.createdAt} />
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table>
                  );
                }}
              </QueryStates>
            )}
          </QueryStates>
        </Card>
        {selected && form && (
          <Card>
            <Card.Header
              title={text("submission")}
              actions={
                <Badge tone={SUBMISSION_STATUS_TONE[selected.status]}>
                  {text(SUBMISSION_STATUS_TEXT[selected.status])}
                </Badge>
              }
            />
            <Card.Body>
              <dl className="submissions-detail">
                <FieldLabel as="dt">{text("submissionSubmitted")}</FieldLabel>
                <dd>
                  <Timestamp at={selected.createdAt} show="dateTime" />
                </dd>
                <FieldLabel as="dt">{text("submissionOrigin")}</FieldLabel>
                <dd>
                  <code>{selected.sourceHash ?? text("submissionOriginUnknown")}</code>
                </dd>
                {Object.entries(selected.values).map(([key, value]) => (
                  <div key={key} className="submissions-detail__field">
                    <FieldLabel as="dt">
                      {formFields(form).find((field) => field.key === key)?.label[language] ?? key}
                    </FieldLabel>
                    <dd>{submittedValueText(value)}</dd>
                  </div>
                ))}
                {selected.consents.map((consent) => (
                  <div key={consent.key} className="submissions-detail__field">
                    <FieldLabel as="dt">
                      {text("submissionConsent")} · {consent.revision}
                    </FieldLabel>
                    <dd>{consent.notice}</dd>
                  </div>
                ))}
              </dl>
            </Card.Body>
            <Card.Footer
              actions={
                <>
                  <span className="actions__aside">
                    <ActionButton action="delete" onClick={() => setConfirmDelete(true)}>
                      {text("submissionDelete")}
                    </ActionButton>
                  </span>
                  {selected.status !== "spam" && (
                    <ActionButton
                      action="markSpam"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ submissionId: selected.id, status: "spam" })}
                    >
                      {text("submissionMarkSpam")}
                    </ActionButton>
                  )}
                  {selected.status === "unread" ? (
                    <ActionButton
                      action="markRead"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ submissionId: selected.id, status: "read" })}
                    >
                      {text("submissionMarkRead")}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      action="markUnread"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ submissionId: selected.id, status: "unread" })}
                    >
                      {text("submissionMarkUnread")}
                    </ActionButton>
                  )}
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
