import {
  type AccountProfile,
  type ChangePasswordBody,
  MAX_PASSWORD_LENGTH,
  MaxLength,
  type UpdateAccountBody,
} from "@layered/schemas";
import { Badge, Card, Field, Input, Segmented } from "@layered/ui";
import { UserCircleIcon } from "@layered/ui/icons";
import { type FormEvent, useRef, useState } from "react";
import { useAccountActions } from "./account-query.js";
import { ActionButton } from "./action-button.js";
import { DASHBOARD_LANGUAGES } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { INTERFACE_SCALES, restoredScale, useInterfaceScale } from "./interface-scale.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";
import { CardDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { useSaveShortcut } from "./save-shortcut.js";

/** The interface sizes as the segmented control offers them, labeled like the reading width's steps. */
const SCALE_OPTIONS = INTERFACE_SCALES.map((scale) => ({ value: scale, label: scale.toUpperCase() }));

/** The three password fields as the dialog holds them, empty until somebody types. */
interface PasswordDraft {
  current: string;
  next: string;
  repeat: string;
}

const NO_PASSWORD: PasswordDraft = { current: "", next: "", repeat: "" };

/**
 * The password change the dialog's save sends, a sentence saying why it cannot,
 * or nothing where no new password was typed.
 *
 * Only the two new fields decide whether a change is meant. A password manager
 * may fill the password in use as soon as the dialog opens, and a save of the
 * name alone must not be refused for it.
 *
 * @param draft - The three fields.
 * @returns The body to send, the catalogue key of the problem, or null.
 */
function passwordChange(
  draft: PasswordDraft,
):
  | { change: ChangePasswordBody }
  | { problem: "accountPasswordIncomplete" | "accountPasswordMismatch" }
  | null {
  if (!draft.next && !draft.repeat) return null;
  if (!draft.current || !draft.next || !draft.repeat) return { problem: "accountPasswordIncomplete" };
  if (draft.next !== draft.repeat) return { problem: "accountPasswordMismatch" };
  return { change: { currentPassword: draft.current, newPassword: draft.next } };
}

/**
 * The signed-in author's account in a dialog: portrait, name, address, a new
 * password, role, interface language and size, a save, and signing out.
 *
 * The password fields stay empty unless the author types a new password, and
 * the dialog's one save then changes it before it stores the rest.
 *
 * @param account - The account as it is stored.
 * @param onClose - Closes the dialog, after a save as well.
 */
export function AccountDialog({ account, onClose }: { account: AccountProfile; onClose: () => void }) {
  const { text } = useDashboardLanguage();
  const { notify } = useNotify();
  const [draft, setDraft] = useState<UpdateAccountBody>({
    displayName: account.displayName,
    email: account.email,
    interfaceLanguage: account.interfaceLanguage,
    avatarMediaId: account.avatarMediaId,
  });
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Kept by this browser rather than by the account, and applied with the
  // account's own changes when the dialog is saved, as the language is.
  const [scale, chooseScale] = useInterfaceScale();
  const [scaleDraft, setScaleDraft] = useState(scale);
  const [passwords, setPasswords] = useState<PasswordDraft>(NO_PASSWORD);
  const [passwordProblem, setPasswordProblem] = useState<string | null>(null);
  const { save, changePassword, signOut, running, saveDraft, signOutOnce } = useAccountActions();
  const accountPending = save.isPending || changePassword.isPending || signOut.isPending;
  const failure = changePassword.error ?? save.error ?? signOut.error;

  /** One of the three password fields, which also clears a problem it has answered. */
  const passwordField = (key: keyof PasswordDraft, label: string, autoComplete: string) => (
    <Field label={label} htmlFor={`account-password-${key}`}>
      <Input
        id={`account-password-${key}`}
        type="password"
        autoComplete={autoComplete}
        value={passwords[key]}
        maxLength={MAX_PASSWORD_LENGTH}
        onChange={(event) => {
          setPasswords((current) => ({ ...current, [key]: event.target.value }));
          setPasswordProblem(null);
        }}
      />
    </Field>
  );

  // Command-S submits the dialog as its Save button does. Registered after the
  // screen behind it, so it is the dialog that saves while it is open.
  const form = useRef<HTMLFormElement>(null);
  useSaveShortcut(() => {
    if (!accountPending) form.current?.requestSubmit();
  });

  function dismiss() {
    if (!running()) onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = passwordChange(passwords);
    if (password && "problem" in password) {
      setPasswordProblem(text(password.problem));
      return;
    }
    if (!(await saveDraft(draft, password?.change))) return;
    chooseScale(scaleDraft);
    notify({ tone: "success", message: text("saved") });
    onClose();
  }

  return (
    <>
      <CardDialog labelId="account-dialog-title" onClose={dismiss} wide>
        <Card.Header id="account-dialog-title" title={text("account")} />
        <form ref={form} onSubmit={submit}>
          <Card.Stack>
            <div className="account">
              <div className="account__portrait">
                {avatarUrl ? (
                  <img className="account__avatar" src={avatarUrl} alt="" />
                ) : (
                  <span className="account__avatar account__avatar--empty">
                    <UserCircleIcon />
                  </span>
                )}
                {/* One button, because the picker it opens uploads as well. */}
                <ActionButton action="choosePicture" onClick={() => setPickerOpen(true)}>
                  {text("accountAvatar")}
                </ActionButton>
              </div>
              <div className="account__fields">
                <Field label={text("accountName")} htmlFor="account-name">
                  <Input
                    id="account-name"
                    value={draft.displayName}
                    maxLength={MaxLength.Line}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, displayName: event.target.value }))
                    }
                    autoFocus
                    required
                  />
                </Field>
                <Field label={text("accountEmail")} htmlFor="account-email">
                  <Input
                    id="account-email"
                    type="email"
                    value={draft.email}
                    maxLength={MaxLength.Email}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </Field>
                <Field label={text("accountRole")}>
                  <Badge tone={account.role === "owner" ? "accent" : "neutral"}>
                    {account.role === "owner" ? text("roleOwner") : text("roleEditor")}
                  </Badge>
                </Field>
                <Field label={text("accountLanguage")} hint={text("accountLanguageHint")}>
                  <Segmented
                    aria-label={text("accountLanguage")}
                    value={draft.interfaceLanguage}
                    options={DASHBOARD_LANGUAGES}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        interfaceLanguage: value as UpdateAccountBody["interfaceLanguage"],
                      }))
                    }
                  />
                </Field>
                <Field label={text("accountScale")}>
                  <Segmented
                    aria-label={text("accountScale")}
                    value={scaleDraft}
                    options={SCALE_OPTIONS}
                    onValueChange={(value) => setScaleDraft(restoredScale(value))}
                  />
                </Field>
              </div>
              {/* A column of its own, so the dialog grows wider rather than taller. */}
              <div className="account__fields">
                {passwordField("current", text("accountPasswordCurrent"), "current-password")}
                {passwordField("next", text("accountPasswordNew"), "new-password")}
                {passwordField("repeat", text("accountPasswordRepeat"), "new-password")}
              </div>
            </div>
            {passwordProblem ? (
              <ErrorNotice message={passwordProblem} />
            ) : (
              failure && (
                <ErrorNotice
                  error={failure}
                  keyFor={(known) =>
                    known.code === "conflict"
                      ? "accountEmailTaken"
                      : known.code === "forbidden"
                        ? "accountPasswordWrong"
                        : undefined
                  }
                />
              )
            )}
          </Card.Stack>
          <Card.Footer
            actions={
              <>
                <span className="actions__aside">
                  <ActionButton
                    action="signOut"
                    tone="danger"
                    onClick={signOutOnce}
                    disabled={accountPending}
                  >
                    {signOut.isPending ? text("signOutPending") : text("signOut")}
                  </ActionButton>
                </span>
                <ActionButton action="cancel" onClick={dismiss} disabled={accountPending}>
                  {text("cancel")}
                </ActionButton>
                <ActionButton action="save" type="submit" tone="primary" disabled={accountPending}>
                  {save.isPending ? text("savePending") : text("save")}
                </ActionButton>
              </>
            }
          />
        </form>
      </CardDialog>
      {pickerOpen && (
        <MediaPicker
          onCancel={() => setPickerOpen(false)}
          onChoose={(item) => {
            setDraft((current) => ({ ...current, avatarMediaId: item.id }));
            setAvatarUrl(item.url);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
