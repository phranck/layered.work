import { MAX_PASSWORD_LENGTH, MaxLength, signInBody } from "@layered/schemas";
import { Button, Card, Field, Input, Logo } from "@layered/ui";
import { SignInIcon } from "@layered/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DashboardApiError } from "./api.js";
import { safeReturnTo } from "./auth-routing.js";
import { useDashboardApi } from "./dashboard-context.js";

export function LoginScreen() {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expired] = useState(() => searchParams.get("expired") === "1");
  const [error, setError] = useState<DashboardApiError | null>(null);
  const submittingRef = useRef(false);
  const mutation = useMutation({
    mutationFn: api.signIn,
    onSuccess: (session) => queryClient.setQueryData(["session"], session),
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
    const parsed = signInBody.safeParse({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (!parsed.success) {
      setError(new DashboardApiError("Bitte prüfe E-Mail-Adresse und Passwort."));
      submittingRef.current = false;
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
      await navigate(safeReturnTo(searchParams.get("returnTo")), { replace: true });
    } catch (cause) {
      const apiError =
        cause instanceof DashboardApiError
          ? cause
          : new DashboardApiError("Die Anmeldung ist fehlgeschlagen.");
      setError(
        apiError.code === "unauthenticated"
          ? new DashboardApiError("E-Mail-Adresse oder Passwort stimmen nicht.")
          : apiError,
      );
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <main className="workbench login-page">
      <Logo href="/login" inkHeight="26px" />
      <Card className="login-card">
        <Card.Header title="Anmelden" />
        <Card.Body>
          <form className="login-form" onSubmit={submit}>
            {expired && <p role="status">Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.</p>}
            {error && (
              <p className="dashboard-error" role="alert">
                {error.message}
                {error.id && <span className="dashboard-error__id">Fehler-ID: {error.id}</span>}
              </p>
            )}
            <Field label="E-Mail-Adresse" htmlFor="login-email">
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                maxLength={MaxLength.Line}
                required
                autoFocus
              />
            </Field>
            <Field label="Passwort" htmlFor="login-password">
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={MAX_PASSWORD_LENGTH}
                required
              />
            </Field>
            <div className="actions">
              <Button
                type="submit"
                tone="primary"
                disabled={mutation.isPending}
                icon={<SignInIcon weight="bold" />}
              >
                {mutation.isPending ? "Anmeldung läuft…" : "Anmelden"}
              </Button>
            </div>
          </form>
        </Card.Body>
      </Card>
    </main>
  );
}
