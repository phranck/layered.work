import {
  type ContentLanguage,
  type MailTemplate,
  type MailTemplateKind,
  type SaveMailTemplateBody,
  saveMailTemplateBody,
} from "@layered/schemas";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkedDraft } from "./checked-draft.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The mail templates as the dashboard holds them, every change made to one,
 * and the preview and the test message an edited template is tried with.
 *
 * The kinds of template are fixed by the API. Only their names, subjects and
 * bodies are edited, in both languages.
 */

/** Who receives each template's mail, as the preview's To line names it. */
export const RECIPIENT_TEXT: Record<MailTemplateKind, DashboardStringKey> = {
  submission_notification: "mailRecipientNotification",
  submission_confirmation: "mailRecipientConfirmation",
};

/** Every mail template. */
export function useMailTemplates() {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.mailTemplates, queryFn: api.fetchMailTemplates });
}

/**
 * One template, as its editor opens it.
 *
 * @param kind - Which template.
 */
export function useMailTemplate(kind: MailTemplateKind) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.mailTemplate(kind),
    queryFn: async () => (await api.fetchMailTemplates()).find((item) => item.kind === kind),
  });
}

/**
 * What the editor changes, taken out of the template it opened.
 *
 * @param template - The template as the API returned it.
 */
export function templateDraftOf(template: MailTemplate): SaveMailTemplateBody {
  return { name: template.name, subject: template.subject, body: template.body };
}

/**
 * A template's draft as the body a save or a test sends, or the first issue
 * the schema the API validates with refuses.
 *
 * @param draft - The template as the editor holds it.
 */
export function checkedTemplate(draft: SaveMailTemplateBody | null) {
  return checkedDraft(saveMailTemplateBody, draft);
}

/**
 * Stores a template and keeps the answer as the opened template.
 *
 * @param kind - Which template.
 * @param reactions - What the editor does once it is stored or has failed.
 * @returns The mutation, which takes a body `checkedTemplate` has passed.
 */
export function useSaveMailTemplate(
  kind: MailTemplateKind,
  reactions: Reactions<MailTemplate, SaveMailTemplateBody>,
) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: SaveMailTemplateBody) => api.saveMailTemplate(kind, value),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (saved, value) => {
      client.setQueryData(queryKeys.mailTemplate(kind), saved);
      void client.invalidateQueries({ queryKey: queryKeys.mailTemplates });
      reactions.onSuccess?.(saved, value);
    },
  });
}

/** What one test message is given. */
export interface TemplateTest {
  value: SaveMailTemplateBody;
  language: ContentLanguage;
  recipient: string;
}

/**
 * Sends a template, as it is being edited, to one address, and keeps what
 * SMTP2GO answered.
 *
 * @param kind - Which template.
 * @param reactions - What the editor does when the message could not be sent.
 */
export function useTestMailTemplate(kind: MailTemplateKind, reactions: Reactions<unknown, TemplateTest>) {
  const api = useDashboardApi();
  return useMutation({
    mutationFn: ({ value, language, recipient }: TemplateTest) =>
      api.testMailTemplate(kind, value, language, recipient),
    onError: (error) => reactions.onError?.(error),
  });
}

/**
 * A template's mail as it arrives, rendered by the API with the renderer that
 * sends it, filled with a sample submission.
 *
 * Asked only for a draft the schema accepts. The last mail stays while the
 * next one is asked for, so the preview does not blank out at every pause in
 * the typing, and it carries its language, so a mail in the other language is
 * never shown under the fields.
 *
 * @param kind - Which template.
 * @param draft - The template as it last stood still.
 * @param language - The language the mail is rendered in.
 */
export function useMailPreview(
  kind: MailTemplateKind,
  draft: SaveMailTemplateBody,
  language: ContentLanguage,
) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.mailPreview(kind, language, draft),
    queryFn: async () => ({ language, mail: await api.previewMailTemplate(kind, draft, language) }),
    enabled: saveMailTemplateBody.safeParse(draft).success,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
