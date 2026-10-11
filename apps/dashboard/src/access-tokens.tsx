import { TOKEN_SCOPES, type TokenScope, type TokenSummary } from "@layered/schemas";
import { Badge, Card, Field, Input, Switch } from "@layered/ui";
import { useState } from "react";
import { ActionButton } from "./action-button.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { noRows, QueryStates } from "./query-states.js";
import { Table } from "./table.js";
import { Timestamp } from "./timestamp.js";
import {
  issueBodyOf,
  SCOPE_TEXT,
  useAccessTokens,
  useIssueAccessToken,
  useRevokeAccessToken,
} from "./tokens-query.js";

/**
 * The personal access tokens an agent writes with, as a card on the Settings
 * screen: the tokens issued so far, and a form that issues another.
 *
 * Only the owner manages tokens, so the Settings screen shows this card to the
 * owner alone, and the API refuses everybody else. A new token's value lives in
 * this card's state and nowhere else, so it is shown once, until the card goes.
 */
export function AccessTokensCard() {
  const { text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<TokenScope[]>([]);
  const [expiry, setExpiry] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const tokens = useAccessTokens();
  const issue = useIssueAccessToken({
    onError: notifyError,
    onSuccess: (created) => {
      setRevealed(created.value);
      setName("");
      setScopes([]);
      setExpiry("");
      notify({ tone: "success", message: text("tokenCreated") });
    },
  });
  const [revoking, setRevoking] = useState<TokenSummary | null>(null);
  const revoke = useRevokeAccessToken({
    onSuccess: () => {
      setRevoking(null);
      notify({ tone: "success", message: text("tokenRevokedNotice") });
    },
  });
  const dateOf = (value: string | null) => (value ? <Timestamp at={value} /> : text("tokenNever"));

  return (
    <Card>
      <Card.Header title={text("apiTokens")} meta={tokens.data?.length} />
      <QueryStates query={tokens} empty={text("tokensEmpty")} isEmpty={noRows}>
        {(issued) => (
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
            {issued.map((token) => (
              <Table.Row key={token.id}>
                <Table.Cell kind="title">
                  <Table.Title title={token.name} />
                </Table.Cell>
                <Table.Cell>{token.scopes.map((scope) => text(SCOPE_TEXT[scope])).join(", ")}</Table.Cell>
                <Table.Cell kind="state">
                  <Badge tone={token.revokedAt ? "neutral" : "success"}>
                    {token.revokedAt ? text("tokenRevoked") : text("tokenActive")}
                  </Badge>
                </Table.Cell>
                <Table.Cell kind="date">{dateOf(token.lastUsedAt)}</Table.Cell>
                <Table.Cell kind="date">{dateOf(token.expiresAt)}</Table.Cell>
                <Table.Actions>
                  {!token.revokedAt && (
                    <ActionButton.Icon
                      action="delete"
                      label={text("tokenRevoke")}
                      onClick={() => setRevoking(token)}
                    />
                  )}
                </Table.Actions>
              </Table.Row>
            ))}
          </Table>
        )}
      </QueryStates>
      <Card.Stack>
        {revealed && (
          <Field label={text("tokenCreated")} hint={text("tokenSecret")} htmlFor="token-secret">
            <Input id="token-secret" value={revealed} readOnly onFocus={(event) => event.target.select()} />
          </Field>
        )}
        <div className="field-row">
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
        </div>
        <Field.Set label={text("tokenScopes")}>
          <Field.InlineGroup>
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
          </Field.InlineGroup>
        </Field.Set>
      </Card.Stack>
      <Card.Footer
        actions={
          <ActionButton
            action="issueToken"
            tone="primary"
            disabled={!name.trim() || issue.isPending}
            onClick={() => issue.mutate(issueBodyOf(name, scopes, expiry))}
          >
            {text("tokenCreate")}
          </ActionButton>
        }
      />
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
    </Card>
  );
}
