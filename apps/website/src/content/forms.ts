import { randomUUID } from "node:crypto";
import { type RenderNode, referencedFormNames } from "@layered/content";
import type { FormSubmissionValues } from "@layered/schemas";
import type { FormEmbedProps, FormOutcome } from "@layered/ui";
import type { ContentRepository, Entry } from "./repository.js";

const TIMEOUT_MS = 5_000;

/** Values from native form controls, including repeated checkbox names. */
export function submittedValues(form: FormEmbedProps["form"], data: FormData): FormSubmissionValues {
  return Object.fromEntries(
    form.fields.map((field) => {
      const values = data.getAll(field.key).filter((value): value is string => typeof value === "string");
      return [field.key, field.type === "multipleChoice" ? values : (values[0] ?? "")];
    }),
  );
}

type Submission = { slug: string; outcome: FormOutcome; httpStatus: number };

/** Server-side submission preserves values and field errors for the same page. */
export async function submitPageForm(
  request: Request,
  repository: ContentRepository,
  nodes: readonly RenderNode[],
  entry: Entry,
): Promise<Submission | undefined> {
  const data = await request.formData();
  const slug = data.get("_form");
  if (typeof slug !== "string" || !referencedFormNames(nodes).includes(slug)) return undefined;
  const form = repository.form(slug);
  if (!form) return undefined;
  const values = submittedValues(form, data);
  const language = entry.language;
  const base = process.env.API_URL;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!base) return unavailable(slug, values, "missing_api_url");
  try {
    const response = await fetch(new URL(`/forms/${slug}/submissions`, base), {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
      },
      body: JSON.stringify({
        challenge: data.get("_challenge"),
        honeypot: data.get("_website") ?? "",
        language,
        values,
      }),
    });
    const payload = await response.json();
    if (response.ok && typeof payload?.data?.successMessage === "string") {
      return { slug, outcome: { status: "success", message: payload.data.successMessage }, httpStatus: 200 };
    }
    const id = typeof payload?.error?.id === "string" ? payload.error.id : undefined;
    const code = typeof payload?.error?.code === "string" ? payload.error.code : undefined;
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : language === "de"
          ? "Die Eingabe konnte nicht gesendet werden."
          : "The submission could not be sent.";
    const fields = payload?.fieldErrors && typeof payload.fieldErrors === "object" ? payload.fieldErrors : {};
    return {
      slug,
      httpStatus: response.ok ? 502 : response.status,
      outcome: {
        status: "error",
        message: id ? `${message} (${id})` : message,
        code,
        errorId: id,
        values,
        errors: fields,
      },
    };
  } catch (error) {
    return unavailable(slug, values, error instanceof Error ? error.name : "UnknownError");
  }
}

function unavailable(slug: string, values: FormSubmissionValues, cause: string): Submission {
  const id = randomUUID();
  console.error(
    JSON.stringify({
      code: "WEBSITE_FORM_SUBMISSION_UNAVAILABLE",
      errorId: id,
      operation: "submit_form",
      status: 503,
      result: "unavailable",
      cause,
    }),
  );
  return {
    slug,
    httpStatus: 503,
    outcome: {
      status: "error",
      message: `The form is currently unavailable. Quote ${id} if you report this.`,
      code: "WEBSITE_FORM_SUBMISSION_UNAVAILABLE",
      errorId: id,
      values,
    },
  };
}

/** A fresh challenge on every page response, never cached with the content snapshot. */
export async function formsForPage(
  repository: ContentRepository,
  nodes: readonly RenderNode[],
  language: Entry["language"],
  outcome?: Submission,
  preview = false,
): Promise<Record<string, FormEmbedProps>> {
  const names = referencedFormNames(nodes);
  const entries = await Promise.all(
    names.map(async (name): Promise<[string, FormEmbedProps] | undefined> => {
      const form = repository.form(name);
      if (!form) return undefined;
      let challenge: string | undefined;
      let availabilityError: FormEmbedProps["availabilityError"];
      if (!preview && process.env.API_URL) {
        try {
          const response = await fetch(new URL(`/forms/${name}/challenge`, process.env.API_URL), {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { Accept: "application/json" },
          });
          const payload = await response.json();
          if (response.ok && typeof payload?.data?.challenge === "string") {
            challenge = payload.data.challenge;
          } else {
            availabilityError = {
              message:
                typeof payload?.error?.message === "string"
                  ? payload.error.message
                  : language === "de"
                    ? "Das Formular ist derzeit nicht verfügbar."
                    : "The form is currently unavailable.",
              code: typeof payload?.error?.code === "string" ? payload.error.code : undefined,
              errorId: typeof payload?.error?.id === "string" ? payload.error.id : undefined,
            };
          }
        } catch (error) {
          const id = randomUUID();
          console.error(
            JSON.stringify({
              code: "WEBSITE_FORM_CHALLENGE_UNAVAILABLE",
              errorId: id,
              operation: "form_challenge",
              status: 503,
              result: "unavailable",
              cause: error instanceof Error ? error.name : "UnknownError",
            }),
          );
          availabilityError = {
            message: `${language === "de" ? "Das Formular ist derzeit nicht verfügbar." : "The form is currently unavailable."} (${id})`,
            code: "WEBSITE_FORM_CHALLENGE_UNAVAILABLE",
            errorId: id,
          };
        }
      } else if (!preview) {
        const id = randomUUID();
        console.error(
          JSON.stringify({
            code: "WEBSITE_FORM_CHALLENGE_UNAVAILABLE",
            errorId: id,
            operation: "form_challenge",
            status: 503,
            result: "unavailable",
            cause: "missing_api_url",
          }),
        );
        availabilityError = {
          message: `${language === "de" ? "Das Formular ist derzeit nicht verfügbar." : "The form is currently unavailable."} (${id})`,
          code: "WEBSITE_FORM_CHALLENGE_UNAVAILABLE",
          errorId: id,
        };
      }
      return [
        name,
        {
          form,
          language,
          challenge,
          availabilityError,
          outcome: outcome?.slug === name ? outcome.outcome : undefined,
          preview,
        },
      ];
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is [string, FormEmbedProps] => !!entry));
}
