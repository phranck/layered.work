/**
 * Sending through SMTP2GO's HTTP API.
 *
 * One request to one fixed address, with the key in a header. Nothing about the
 * destination comes from a request, redirects are refused rather than followed,
 * and a provider that does not answer within the timeout counts as a refusal.
 *
 * SMTP2GO answers 200 even when it did not take the message, so the outcome is
 * read from the body: `succeeded` and `failures` on a send it processed, and
 * `error` on one it refused. Neither the key nor the recipient is ever logged.
 */

/** Where every message goes. Fixed, so no input can point the key anywhere else. */
export const SMTP2GO_SEND_URL = "https://api.smtp2go.com/v3/email/send";

/** How long SMTP2GO has to answer before the attempt counts as failed, in milliseconds. */
const SEND_TIMEOUT_MS = 10_000;

/** One message, as the sender knows it. */
export interface OutgoingMail {
  /** `Name <address>`, already checked to be a safe header value. */
  sender: string;
  /** One recipient, as an address. */
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** What SMTP2GO said, in its own words. */
export interface SendOutcome {
  accepted: boolean;
  answer: string;
}

/** The parts of SMTP2GO's answer this reads. Anything else in it is ignored. */
interface ProviderBody {
  data?: {
    succeeded?: number;
    failed?: number;
    failures?: unknown[];
    email_id?: string;
    error?: string;
    error_code?: string;
  };
}

/**
 * Hands one message to SMTP2GO and reports what it answered.
 *
 * `fastaccept` is left off, because only a synchronous send reports
 * `succeeded` and `failures`, and the answer is the point of a test message.
 *
 * @param apiKey - The SMTP2GO key from the environment.
 * @param mail - The message.
 * @param send - The fetch to use, which a test replaces.
 * @returns Whether SMTP2GO took the message, and its words for it.
 */
export async function sendThroughSmtp2go(
  apiKey: string,
  mail: OutgoingMail,
  send: typeof fetch = fetch,
): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await send(SMTP2GO_SEND_URL, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: { "content-type": "application/json", "X-Smtp2go-Api-Key": apiKey },
      body: JSON.stringify({
        sender: mail.sender,
        to: [mail.to],
        subject: mail.subject,
        text_body: mail.text,
        ...(mail.html ? { html_body: mail.html } : {}),
      }),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return {
      accepted: false,
      answer: timedOut ? "SMTP2GO did not answer in time." : "SMTP2GO could not be reached.",
    };
  }

  let body: ProviderBody = {};
  try {
    body = (await response.json()) as ProviderBody;
  } catch {
    // An answer that is not JSON is reported by its status below.
  }
  const data = body.data ?? {};

  if (response.ok && (data.succeeded ?? 0) > 0 && (data.failed ?? 0) === 0) {
    return { accepted: true, answer: `Accepted as ${data.email_id ?? "a message without an id"}.` };
  }
  const failure = data.error ?? data.failures?.map(String).join("; ");
  return {
    accepted: false,
    answer: failure ? failure : `SMTP2GO answered with status ${response.status}.`,
  };
}
