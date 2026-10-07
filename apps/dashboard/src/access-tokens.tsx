import { type IssueTokenBody, TOKEN_SCOPES, type TokenScope } from "@layered/schemas";
import { Button, Card, Field, Input, Switch } from "@layered/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";

/** What each permission is called in the catalogue. */
const SCOPE_TEXT: Record<TokenScope, DashboardStringKey> = {
  "content:read": "tokenScopeRead",
  "content:write": "tokenScopeWrite",
  "content:publish": "tokenScopePublish",
  "media:write": "tokenScopeUpload",
};

/** The secret lives only in this component's state after issuance. */
export function AccessTokensScreen() {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { language, text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<TokenScope[]>([]);
  const [expiry, setExpiry] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const tokens = useQuery({ queryKey: ["access-tokens"], queryFn: api.fetchAccessTokens });
  const issue = useMutation({
    mutationFn: (value: IssueTokenBody) => api.issueAccessToken(value),
    onError: (error) => notifyError(error),
    onSuccess: (created) => {
      setRevealed(created.value);
      setName("");
      setScopes([]);
      setExpiry("");
      void queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
      notify({ tone: "success", message: text("tokenCreated") });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeAccessToken(id),
    onError: (error) => notifyError(error),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
      notify({ tone: "success", message: text("tokenRevokedNotice") });
    },
  });
  const timestamp = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(language === "de" ? "de-AT" : "en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : text("tokenNever");

  return (
    <>
      <ScreenTitle title={text("apiTokens")} />
      <Card>
        <Card.Header title={text("tokenCreate")} />
        <Card.Body>
          <Field label={text("tokenName")} htmlFor="token-name">
            <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={text("tokenExpiry")} htmlFor="token-expiry">
            <Input
              id="token-expiry"
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </Field>
          <p>{text("tokenScopes")}</p>
          {TOKEN_SCOPES.map((scope) => (
            <Field.Inline key={scope} label={text(SCOPE_TEXT[scope])} htmlFor={`token-scope-${scope}`}>
              <Switch
                id={`token-scope-${scope}`}
                aria-label={text(SCOPE_TEXT[scope])}
                checked={scopes.includes(scope)}
                onCheckedChange={(checked) =>
                  setScopes((current) =>
                    checked ? [...current, scope] : current.filter((item) => item !== scope),
                  )
                }
              />
            </Field.Inline>
          ))}
        </Card.Body>
        <Card.Footer
          actions={
            <Button
              tone="primary"
              disabled={!name.trim() || issue.isPending}
              onClick={() =>
                issue.mutate({
                  name: name.trim(),
                  scopes,
                  expiresAt: expiry ? new Date(expiry).toISOString() : null,
                })
              }
            >
              {text("tokenCreate")}
            </Button>
          }
        />
      </Card>
      {revealed && (
        <Card>
          <Card.Header title={text("tokenCreated")} />
          <Card.Body>
            <p role="status">{text("tokenSecret")}</p>
            <Input
              aria-label={text("tokenCreated")}
              value={revealed}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </Card.Body>
        </Card>
      )}
      <Card>
        <Card.Header title={text("apiTokens")} meta={tokens.data?.length} />
        {tokens.isError && (
          <Card.Body>
            <ErrorNotice error={tokens.error} />
          </Card.Body>
        )}
        {tokens.isSuccess && tokens.data.length === 0 && (
          <Card.Body>
            <p>{text("tokensEmpty")}</p>
          </Card.Body>
        )}
        {tokens.data?.map((token) => (
          <Card.Body key={token.id}>
            <strong>{token.name}</strong>
            <p>{token.scopes.map((scope) => text(SCOPE_TEXT[scope])).join(", ")}</p>
            <p>
              {text("tokenLastUse")}: {timestamp(token.lastUsedAt)} · {text("tokenExpires")}:{" "}
              {timestamp(token.expiresAt)}
            </p>
            {token.revokedAt ? (
              <p>{text("tokenRevoked")}</p>
            ) : (
              <Button tone="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(token.id)}>
                {text("tokenRevoke")}
              </Button>
            )}
          </Card.Body>
        ))}
      </Card>
    </>
  );
}
