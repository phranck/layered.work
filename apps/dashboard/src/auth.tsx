import { MAX_PASSWORD_LENGTH, MaxLength, signInBody } from "@layered/schemas";
import { Button, Card, Field, Input, Logo, SkyBackdrop } from "@layered/ui";
import { SignInIcon } from "@layered/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DashboardApiError } from "./api.js";
import { safeReturnTo } from "./auth-routing.js";
import { useDashboardApi } from "./dashboard-context.js";
import { browserLanguage } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { DashboardLanguageProvider, useDashboardLanguage } from "./language-context.js";
import { queryKeys } from "./query-keys.js";

/** The sign-in form's id, which the footer's button names to submit it. */
const LOGIN_FORM = "login-form";

export interface LoginScreenProps {
  /** An explicitly injected alias for isolated local previews, never an auth bypass. */
  loginAlias?: { username: string; email: string };
}

/**
 * The sign-in screen, in the browser's language, because nobody is signed in
 * whose account could say otherwise.
 */
export function LoginScreen(props: LoginScreenProps = {}) {
  return (
    <DashboardLanguageProvider language={browserLanguage()}>
      <LoginForm {...props} />
    </DashboardLanguageProvider>
  );
}

function LoginForm({ loginAlias }: LoginScreenProps) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expired] = useState(() => searchParams.get("expired") === "1");
  const [error, setError] = useState<DashboardApiError | null>(null);
  const submittingRef = useRef(false);
  const mutation = useMutation({
    mutationFn: api.signIn,
    onSuccess: (session) => queryClient.setQueryData(queryKeys.session, session),
  });

  useEffect(() => {
    if (!searchParams.has("expired")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("expired");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("email"));
    const parsed = signInBody.safeParse({
      email: loginAlias && identifier === loginAlias.username ? loginAlias.email : identifier,
      password: String(form.get("password")),
    });
    if (!parsed.success) {
      setError(new DashboardApiError(loginAlias ? "signInCheckUsername" : "signInCheckEmail"));
      submittingRef.current = false;
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
      await navigate(safeReturnTo(searchParams.get("returnTo")), { replace: true });
    } catch (cause) {
      const apiError = cause instanceof DashboardApiError ? cause : new DashboardApiError("serverUnexpected");
      setError(
        apiError.code === "unauthenticated"
          ? new DashboardApiError(loginAlias ? "signInRefusedUsername" : "signInRefusedEmail")
          : apiError,
      );
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <main className="workbench login-page">
      <SkyBackdrop />
      <Logo href="/login" inkHeight="34px" />
      <Card className="login-card">
        <Card.Header title={text("signIn")} />
        <Card.Body>
          <form id={LOGIN_FORM} className="login-form" onSubmit={submit}>
            {expired && <p role="status">{text("sessionExpired")}</p>}
            {error && <ErrorNotice error={error} />}
            <Field label={text(loginAlias ? "signInUsername" : "signInEmail")} htmlFor="login-email">
              <Input
                id="login-email"
                name="email"
                type={loginAlias ? "text" : "email"}
                autoComplete="username"
                maxLength={MaxLength.Line}
                required
                autoFocus
              />
            </Field>
            <Field label={text("signInPassword")} htmlFor="login-password">
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={MAX_PASSWORD_LENGTH}
                required
              />
            </Field>
          </form>
        </Card.Body>
        {/* The button that submits the form ends the card, at its right edge,
            rather than standing among the fields. The `form` attribute is what
            keeps it submitting a form it no longer sits inside. */}
        <Card.Footer>
          <Button
            type="submit"
            form={LOGIN_FORM}
            tone="primary"
            disabled={mutation.isPending}
            icon={<SignInIcon weight="duotone" />}
          >
            {mutation.isPending ? text("signInPending") : text("signIn")}
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}
