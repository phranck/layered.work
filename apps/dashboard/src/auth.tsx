import { MAX_PASSWORD_LENGTH, MaxLength } from "@layered/schemas";
import { Button, Card, Field, Input, Logo, SkyBackdrop } from "@layered/ui";
import { SignInIcon } from "@layered/ui/icons";
import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { browserLanguage } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { DashboardLanguageProvider, useDashboardLanguage } from "./language-context.js";
import { type LoginAlias, useSignIn } from "./session-queries.js";

/** The sign-in form's id, which the footer's button names to submit it. */
const LOGIN_FORM = "login-form";

/** Props for the sign-in screen. */
export interface LoginScreenProps {
  /** An explicitly injected alias for isolated local previews, never an auth bypass. */
  loginAlias?: LoginAlias;
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

/**
 * The sign-in card: the address or the alias, the password, and the button
 * that submits them. A sign-in that a session's expiry led to says so once,
 * and the notice's parameter is taken out of the address.
 */
function LoginForm({ loginAlias }: LoginScreenProps) {
  const { text } = useDashboardLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expired] = useState(() => searchParams.get("expired") === "1");
  const { signIn, error, pending } = useSignIn(loginAlias);

  useEffect(() => {
    if (!searchParams.has("expired")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("expired");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void signIn(String(form.get("email")), String(form.get("password")));
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
                maxLength={MaxLength.Email}
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
            disabled={pending}
            icon={<SignInIcon weight="duotone" />}
          >
            {pending ? text("signInPending") : text("signIn")}
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}
