import { type IssueTokenBody, TOKEN_SCOPES, type TokenScope, type TokenSummary } from "@layered/schemas";
import { Button, Card, Field, Input, Switch } from "@layered/ui";
import { TrashIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { DATE_FORMAT } from "./format.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import { Table } from "./table.js";

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
  const tokens = useQuery({ queryKey: queryKeys.accessTokens, queryFn: api.fetchAccessTokens });
  const issue = useMutation({
    mutationFn: (value: IssueTokenBody) => api.issueAccessToken(value),
    onError: (error) => notifyError(error),
    onSuccess: (created) => {
      setRevealed(created.value);
      setName("");
      setScopes([]);
      setExpiry("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.accessTokens });
      notify({ tone: "success", message: text("tokenCreated") });
    },
  });
  const [revoking, setRevoking] = useState<TokenSummary | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeAccessToken(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accessTokens });
      setRevoking(null);
      notify({ tone: "success", message: text("tokenRevokedNotice") });
    },
  });
  const dateOf = (value: string | null) =>
    value ? (
      <time dateTime={value}>{DATE_FORMAT[language].format(new Date(value))}</time>
    ) : (
      text("tokenNever")
    );

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
        {tokens.isSuccess && tokens.data.length === 0 && <Table.Empty>{text("tokensEmpty")}</Table.Empty>}
        {tokens.isSuccess && tokens.data.length > 0 && (
          <Table
            columns={[
              { kind: "title", label: text("columnName") },
              { kind: "text", label: text("tokenScopes") },
              { kind: "state", label: text("columnState") },
              { kind: "date", label: text("tokenLastUse") },
              { kind: "date", label: text("tokenExpires") },
              { kind: "action", label: text("columnAction") },
            ]}
          >
            {tokens.data.map((token) => (
              <Table.Row key={token.id}>
                <Table.Cell kind="title">
                  <Table.Title title={token.name} />
                </Table.Cell>
                <Table.Cell>{token.scopes.map((scope) => text(SCOPE_TEXT[scope])).join(", ")}</Table.Cell>
                <Table.Cell kind="state">
                  <Table.Badge tone={token.revokedAt ? "neutral" : "success"}>
                    {token.revokedAt ? text("tokenRevoked") : text("tokenActive")}
                  </Table.Badge>
                </Table.Cell>
                <Table.Cell kind="date">{dateOf(token.lastUsedAt)}</Table.Cell>
                <Table.Cell kind="date">{dateOf(token.expiresAt)}</Table.Cell>
                <Table.Actions>
                  {!token.revokedAt && (
                    <Button.Icon
                      label={text("tokenRevoke")}
                      icon={<TrashIcon />}
                      onClick={() => setRevoking(token)}
                    />
                  )}
                </Table.Actions>
              </Table.Row>
            ))}
          </Table>
        )}
      </Card>
      {revoking && (
        <ConfirmDialog
          title={text("tokenRevokeTitle", revoking.name)}
          confirm={revoke.isPending ? text("tokenRevokePending") : text("tokenRevoke")}
          busy={revoke.isPending}
          error={revoke.error}
          onConfirm={() => revoke.mutate(revoking.id)}
          onClose={() => setRevoking(null)}
        >
          <p>{text("tokenRevokeBody")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
