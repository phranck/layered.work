import {
  type FormSubmission,
  type FormSubmissionStatus,
  type InterfaceLanguage,
  submittedValueText,
} from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";
import type { BadgeTone } from "./table.js";

/**
 * The submissions of one form as the inbox holds them, what a search leaves of
 * them, and every change made to one.
 *
 * The inbox asks again every second, because a submission arrives from the
 * site without the dashboard being told.
 */

/** How often the inbox asks for its form's submissions again, in milliseconds. */
const SUBMISSIONS_POLL_MS = 1000;

/** How many characters of a submission's first answer its row shows. */
const PREVIEW_LENGTH = 120;

/** What each status of a submission is called in the catalogue. */
export const SUBMISSION_STATUS_TEXT: Record<FormSubmissionStatus, DashboardStringKey> = {
  unread: "submissionUnread",
  read: "submissionRead",
  spam: "submissionSpam",
};

/**
 * The tone each status is shown in: an unread submission asks to be read, a
 * read one asks nothing, and spam is what was refused.
 */
export const SUBMISSION_STATUS_TONE: Record<FormSubmissionStatus, BadgeTone> = {
  unread: "info",
  read: "neutral",
  spam: "danger",
};

/**
 * The first answer of a submission that is not empty, shortened to what its
 * row shows.
 *
 * @param submission - The submission.
 */
export function submissionPreview(submission: FormSubmission): string {
  return (
    Object.values(submission.values)
      .map((value) => submittedValueText(value))
      .find(Boolean)
      ?.slice(0, PREVIEW_LENGTH) ?? ""
  );
}

/**
 * The submissions a search leaves: those with the text anywhere in their
 * status, their origin or their answers, ignoring case.
 *
 * @param submissions - Every submission of the form.
 * @param search - What the reader typed.
 * @param language - The interface language, whose rules decide what ignoring case means.
 */
export function filterSubmissions(
  submissions: readonly FormSubmission[],
  search: string,
  language: InterfaceLanguage,
): FormSubmission[] {
  const needle = search.trim().toLocaleLowerCase(language);
  if (!needle) return [...submissions];
  return submissions.filter((submission) =>
    [submission.status, submission.sourceHash ?? "", ...Object.values(submission.values).flat()]
      .join(" ")
      .toLocaleLowerCase(language)
      .includes(needle),
  );
}

/**
 * The submissions of one form, asked again every second.
 *
 * @param formId - The form, or empty before one is known, which asks nothing.
 */
export function useFormSubmissions(formId: string) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.formSubmissions(formId),
    queryFn: () => api.fetchFormSubmissions(formId),
    enabled: Boolean(formId),
    refetchInterval: SUBMISSIONS_POLL_MS,
  });
}

/** Fetches the form's submissions and the sidebar's counts again after a change to one. */
function useRefreshSubmissions(formId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.formSubmissions(formId) }),
      refreshCounts(client),
    ]);
}

/** Which submission a change is made to, and the status it is given. */
export interface StatusChange {
  submissionId: string;
  status: FormSubmissionStatus;
}

/**
 * Marks a submission read, unread or spam.
 *
 * @param formId - The form the submission belongs to.
 * @param reactions - What the inbox does once it is stored or has failed.
 */
export function useSetSubmissionStatus(formId: string, reactions: Reactions<FormSubmission, StatusChange>) {
  const api = useDashboardApi();
  const refresh = useRefreshSubmissions(formId);
  return useMutation({
    mutationFn: ({ submissionId, status }: StatusChange) =>
      api.setFormSubmissionStatus(formId, submissionId, status),
    onError: (error) => reactions.onError?.(error),
    onSuccess: async (stored, change) => {
      await refresh();
      reactions.onSuccess?.(stored, change);
    },
  });
}

/**
 * Deletes a submission for good.
 *
 * @param formId - The form the submission belongs to.
 * @param reactions - What the inbox does once it is gone or has failed.
 * @returns The mutation, which takes the submission's id.
 */
export function useDeleteSubmission(formId: string, reactions: Reactions<void, string>) {
  const api = useDashboardApi();
  const refresh = useRefreshSubmissions(formId);
  return useMutation({
    mutationFn: (submissionId: string) => api.deleteFormSubmission(formId, submissionId),
    onError: (error) => reactions.onError?.(error),
    onSuccess: async (_result, submissionId) => {
      reactions.onSuccess?.(undefined, submissionId);
      await refresh();
    },
  });
}
