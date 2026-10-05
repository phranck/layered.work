import { type IssueTokenBody, TOKEN_SCOPES, type TokenScope } from "@layered/schemas";
import { Button, Card, Field, Input, Switch } from "@layered/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";

const words = {
  en: {
    title: "API tokens",
    name: "Token name",
    expiry: "Expiry (optional)",
    create: "Create token",
    scopes: "Permissions",
    secret: "Copy this value now. It will not be shown again.",
    revoke: "Revoke",
    revoked: "Revoked",
    never: "Never",
    lastUse: "Last used",
    expires: "Expires",
    read: "Read content",
    write: "Write content",
    publish: "Publish content",
    upload: "Upload media",
    created: "Token created",
    removed: "Token revoked",
    empty: "No tokens yet.",
  },
  de: {
    title: "API-Tokens",
    name: "Token-Name",
    expiry: "Ablauf (optional)",
    create: "Token erstellen",
    scopes: "Berechtigungen",
    secret: "Kopiere diesen Wert jetzt. Er wird nicht erneut angezeigt.",
    revoke: "Widerrufen",
    revoked: "Widerrufen",
    never: "Nie",
    lastUse: "Zuletzt verwendet",
    expires: "Läuft ab",
    read: "Inhalte lesen",
    write: "Inhalte schreiben",
    publish: "Inhalte veröffentlichen",
    upload: "Medien hochladen",
    created: "Token erstellt",
    removed: "Token widerrufen",
    empty: "Noch keine Tokens.",
  },
} as const;

/** The secret lives only in this component's state after issuance. */
export function AccessTokensScreen() {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { language } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const w = words[language];
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
      notify({ tone: "success", message: w.created });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeAccessToken(id),
    onError: (error) => notifyError(error),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
      notify({ tone: "success", message: w.removed });
    },
  });
  const names: Record<TokenScope, string> = {
    "content:read": w.read,
    "content:write": w.write,
    "content:publish": w.publish,
    "media:write": w.upload,
  };
  const timestamp = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(language === "de" ? "de-AT" : "en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : w.never;

  return (
    <>
      <ScreenTitle title={w.title} />
      <Card>
        <Card.Header title={w.create} />
        <Card.Body>
          <Field label={w.name} htmlFor="token-name">
            <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={w.expiry} htmlFor="token-expiry">
            <Input
              id="token-expiry"
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </Field>
          <p>{w.scopes}</p>
          {TOKEN_SCOPES.map((scope) => (
            <Field.Inline key={scope} label={names[scope]} htmlFor={`token-scope-${scope}`}>
              <Switch
                id={`token-scope-${scope}`}
                aria-label={names[scope]}
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
              {w.create}
            </Button>
          }
        />
      </Card>
      {revealed && (
        <Card>
          <Card.Header title={w.created} />
          <Card.Body>
            <p role="status">{w.secret}</p>
            <Input
              aria-label={w.created}
              value={revealed}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </Card.Body>
        </Card>
      )}
      <Card>
        <Card.Header title={w.title} meta={tokens.data?.length} />
        {tokens.isError && (
          <Card.Body>
            <ErrorNotice error={tokens.error} />
          </Card.Body>
        )}
        {tokens.isSuccess && tokens.data.length === 0 && (
          <Card.Body>
            <p>{w.empty}</p>
          </Card.Body>
        )}
        {tokens.data?.map((token) => (
          <Card.Body key={token.id}>
            <strong>{token.name}</strong>
            <p>{token.scopes.map((scope) => names[scope]).join(", ")}</p>
            <p>
              {w.lastUse}: {timestamp(token.lastUsedAt)} · {w.expires}: {timestamp(token.expiresAt)}
            </p>
            {token.revokedAt ? (
              <p>{w.revoked}</p>
            ) : (
              <Button tone="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(token.id)}>
                {w.revoke}
              </Button>
            )}
          </Card.Body>
        ))}
      </Card>
    </>
  );
}
