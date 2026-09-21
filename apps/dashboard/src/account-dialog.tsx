import { type AccountProfile, MaxLength, type UpdateAccountBody } from "@layered/schemas";
import { Button, Card, Field, Input, Segmented } from "@layered/ui";
import { FloppyDiskIcon, ImagesIcon, SignOutIcon, UserCircleIcon, XIcon } from "@layered/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { InterfaceLanguage } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";
import { CardDialog } from "./modal.js";

export function AccountDialog({
  account,
  onClose,
  onSignedOut,
}: {
  account: AccountProfile;
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { text } = useDashboardLanguage();
  const [draft, setDraft] = useState<UpdateAccountBody>({
    displayName: account.displayName,
    email: account.email,
    interfaceLanguage: account.interfaceLanguage,
    avatarMediaId: account.avatarMediaId,
  });
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl);
  const [pickerOpen, setPickerOpen] = useState(false);
  const savingRef = useRef(false);
  const signingOutRef = useRef(false);
  const save = useMutation({
    mutationFn: api.updateAccount,
    onSuccess: (profile) => queryClient.setQueryData(["account", profile.id], profile),
  });
  const signOut = useMutation({ mutationFn: api.signOut, onSuccess: () => queryClient.clear() });

  function dismiss() {
    if (savingRef.current || signingOutRef.current) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || signingOutRef.current) return;
    savingRef.current = true;
    try {
      await save.mutateAsync(draft);
      onClose();
    } catch {
      // The mutation retains the structured error for the alert.
    } finally {
      savingRef.current = false;
    }
  }

  async function submitSignOut() {
    if (signingOutRef.current || savingRef.current) return;
    signingOutRef.current = true;
    try {
      await signOut.mutateAsync();
      onClose();
      onSignedOut();
    } catch {
      // The mutation retains the structured error for the alert.
    } finally {
      signingOutRef.current = false;
    }
  }

  return (
    <>
      <CardDialog labelId="account-dialog-title" onClose={dismiss}>
        <Card.Header id="account-dialog-title" title={text("account")} />
        <form onSubmit={submit}>
          <Card.Body>
            <div className="account">
              <div className="account__portrait">
                {avatarUrl ? (
                  <img className="account__avatar" src={avatarUrl} alt="" />
                ) : (
                  <span className="account__avatar account__avatar--empty">
                    <UserCircleIcon weight="duotone" />
                  </span>
                )}
                <Button type="button" onClick={() => setPickerOpen(true)} icon={<ImagesIcon weight="bold" />}>
                  {text("accountAvatar")}
                </Button>
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
                    maxLength={MaxLength.Line}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </Field>
                <Field label={text("accountRole")}>
                  <span className="badge" data-status="public">
                    {account.role === "owner" ? text("administrator") : text("roleEditor")}
                  </span>
                </Field>
                <Field label={text("accountLanguage")} hint={text("accountLanguageHint")}>
                  <Segmented
                    aria-label={text("accountLanguage")}
                    value={draft.interfaceLanguage}
                    options={[
                      { value: InterfaceLanguage.German, label: "Deutsch" },
                      { value: InterfaceLanguage.English, label: "English" },
                    ]}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        interfaceLanguage: value as UpdateAccountBody["interfaceLanguage"],
                      }))
                    }
                  />
                </Field>
                {(save.error || signOut.error) && <ErrorNotice error={save.error ?? signOut.error} />}
              </div>
            </div>
          </Card.Body>
          <Card.Footer
            actions={
              <>
                <Button
                  type="button"
                  tone="danger"
                  onClick={submitSignOut}
                  disabled={signOut.isPending || save.isPending}
                  icon={<SignOutIcon weight="bold" />}
                >
                  {signOut.isPending ? text("signOutPending") : text("signOut")}
                </Button>
                <Button
                  type="button"
                  onClick={dismiss}
                  disabled={save.isPending || signOut.isPending}
                  icon={<XIcon weight="bold" />}
                >
                  {text("cancel")}
                </Button>
                <Button
                  type="submit"
                  tone="primary"
                  disabled={save.isPending || signOut.isPending}
                  icon={<FloppyDiskIcon weight="bold" />}
                >
                  {save.isPending ? text("savePending") : text("save")}
                </Button>
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
