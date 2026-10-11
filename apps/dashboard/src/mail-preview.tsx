import {
  type ContentLanguage,
  type MailTemplateKind,
  mailSenderLine,
  type SaveMailTemplateBody,
  saveMailTemplateBody,
} from "@layered/schemas";
import { Segmented } from "@layered/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { queryKeys } from "./query-keys.js";
import { useSettledValue } from "./settled-value.js";
import "./mail-preview.css";

/** How long the template has to stay unchanged before the preview asks for it again, in milliseconds. */
const PREVIEW_DELAY = 400;

/** Who receives each template's mail, as the preview's To line names it. */
const RECIPIENT: Record<MailTemplateKind, DashboardStringKey> = {
  submission_notification: "mailRecipientNotification",
  submission_confirmation: "mailRecipientConfirmation",
};

/** Which of a mail's two parts the preview shows. */
type MailPart = "html" | "text";

/**
 * The document an HTML mail is shown in: the mail's own markup on the white a
 * mail client gives it, with every link opening outside the frame.
 *
 * @param html - The mail as the API rendered it.
 */
function messageDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html{color-scheme:light}body{margin:0;padding:20px 24px;background:#fff}</style></head><body>${html}</body></html>`;
}

/** Props for the preview of one template. */
export interface MailPreviewProps {
  kind: MailTemplateKind;
  /** The template as it is being edited. */
  draft: SaveMailTemplateBody;
  /** The language the preview is rendered in. */
  language: ContentLanguage;
}

/**
 * One template's mail as it arrives, following the text while it is written.
 *
 * The API renders the mail with the renderer that sends it, filled with a
 * sample submission, once the text has paused. The head names the sender as
 * the settings hold it, the recipient and the subject, as a mail client does.
 * The HTML part is drawn in a frame of its own, so nothing of the dashboard's
 * styles reaches it. The frame runs no script and opens links outside itself.
 * The plain-text part is the second view of the same message.
 *
 * @returns The head and the selected part, or why the template cannot be rendered yet.
 */
export function MailPreview({ kind, draft, language }: MailPreviewProps) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const [part, setPart] = useState<MailPart>("html");
  const settled = useSettledValue(draft, PREVIEW_DELAY);
  const checked = saveMailTemplateBody.safeParse(settled);
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: api.fetchSettings });
  const preview = useQuery({
    queryKey: [...queryKeys.mailTemplate(kind), "preview", language, settled],
    queryFn: async () => ({ language, mail: await api.previewMailTemplate(kind, settled, language) }),
    enabled: checked.success,
    // The last mail stays while the next one is asked for, so the preview
    // does not blank out at every pause in the typing.
    placeholderData: keepPreviousData,
    retry: false,
  });
  // A mail in the other language is not shown, so what stands under the
  // fields is always the language they are in.
  const shown = preview.data?.language === language ? preview.data.mail : undefined;
  const sender = settings.data ? mailSenderLine(settings.data.mail) : null;
  return (
    <div className="mail-preview">
      <div className="mail-preview__bar">
        <dl className="mail-preview__head">
          <dt>{text("mailPreviewFrom")}</dt>
          <dd>{sender ?? text("mailSenderMissing")}</dd>
          <dt>{text("mailPreviewTo")}</dt>
          <dd>{text(RECIPIENT[kind])}</dd>
          <dt>{text("mailTemplateSubject")}</dt>
          <dd>{shown?.subject}</dd>
        </dl>
        <Segmented
          aria-label={text("mailPreviewMessage")}
          value={part}
          options={[
            { value: "html", label: text("mailTemplateHtml") },
            { value: "text", label: text("mailTemplatePlain") },
          ]}
          onValueChange={(value) => setPart(value as MailPart)}
        />
      </div>
      {preview.isError && <ErrorNotice error={preview.error} />}
      {shown &&
        (part === "html" ? (
          <MessageFrame html={shown.html} title={text("mailPreviewMessage")} />
        ) : (
          <pre className="mail-preview__text">{shown.text}</pre>
        ))}
    </div>
  );
}

/**
 * The HTML part in a frame as tall as the message, so the page scrolls rather
 * than the frame.
 *
 * The frame shares the dashboard's origin, which is what lets its height be
 * read, and runs no script at all, which is what makes sharing the origin safe.
 */
function MessageFrame({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    // The document's own height, which is not held up by the frame's current
    // one as its scroll height would be, plus the frame's edge.
    const measure = () => {
      const content = element.contentDocument?.documentElement.offsetHeight;
      if (content !== undefined) setHeight(content + element.offsetHeight - element.clientHeight);
    };
    const loaded = () => {
      measure();
      element.contentWindow?.addEventListener("resize", measure);
    };
    element.addEventListener("load", loaded);
    return () => {
      element.removeEventListener("load", loaded);
      element.contentWindow?.removeEventListener("resize", measure);
    };
  }, []);
  return (
    <iframe
      ref={frame}
      className="mail-preview__frame"
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={messageDocument(html)}
      style={{ height }}
    />
  );
}
