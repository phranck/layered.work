import {
  ACCEPTED_IMAGE_TYPES,
  type AccountProfile,
  MaxLength,
  type UpdateAccountBody,
} from "@layered/schemas";
import { Button, Card, Field, Input, Segmented } from "@layered/ui";
import {
  FloppyDiskIcon,
  ImagesIcon,
  SignOutIcon,
  UploadSimpleIcon,
  UserCircleIcon,
  XIcon,
} from "@layered/ui/icons";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { useAccountActions } from "./account-query.js";
import { DASHBOARD_LANGUAGES } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { INTERFACE_SCALES, restoredScale, useInterfaceScale } from "./interface-scale.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";
import { useUploadMedia } from "./media-query.js";
import { CardDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { useSaveShortcut } from "./save-shortcut.js";

/** The interface sizes as the segmented control offers them, labeled like the reading width's steps. */
const SCALE_OPTIONS = INTERFACE_SCALES.map((scale) => ({ value: scale, label: scale.toUpperCase() }));

/**
 * The signed-in author's account in a dialog: portrait, name, address, role,
 * interface language and size, a save, and signing out.
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
  const { save, signOut, running, saveDraft, signOutOnce } = useAccountActions();
  const fileInput = useRef<HTMLInputElement>(null);
  // The upload is a file of the library like any other, so the picker and the
  // sidebar's count show it.
  const upload = useUploadMedia({
    onSuccess: (picture) => {
      // The upload becomes the draft portrait, exactly as a chosen picture does,
      // and is kept only when the account is saved.
      setDraft((current) => ({ ...current, avatarMediaId: picture.id }));
      setAvatarUrl(picture.url);
    },
  });
  const accountPending = save.isPending || signOut.isPending;
  const avatarPending = accountPending || upload.isPending;

  // Command-S submits the dialog as its Save button does. Registered after the
  // screen behind it, so it is the dialog that saves whilst it is open.
  const form = useRef<HTMLFormElement>(null);
  useSaveShortcut(() => {
    if (!avatarPending) form.current?.requestSubmit();
  });

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again after an error starts a new upload.
    event.target.value = "";
    if (file) upload.mutate(file);
  }

  function dismiss() {
    if (!running()) onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(await saveDraft(draft))) return;
    chooseScale(scaleDraft);
    notify({ tone: "success", message: text("saved") });
    onClose();
  }

  return (
    <>
      <CardDialog labelId="account-dialog-title" onClose={dismiss}>
        <Card.Header id="account-dialog-title" title={text("account")} />
        <form ref={form} onSubmit={submit}>
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
                <div className="account__portrait-actions">
                  <Button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={upload.isPending}
                    icon={<ImagesIcon weight="duotone" />}
                  >
                    {text("accountAvatar")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={upload.isPending}
                    icon={<UploadSimpleIcon weight="duotone" />}
                  >
                    {upload.isPending ? text("accountAvatarUploading") : text("accountAvatarUpload")}
                  </Button>
                  {/* The browser's own file control, hidden behind the button
                      above so the action looks like every other one. */}
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    hidden
                    onChange={chooseFile}
                  />
                </div>
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
                  <span className="badge" data-status="public">
                    {account.role === "owner" ? text("roleOwner") : text("roleEditor")}
                  </span>
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
                <Field label={text("accountScale")} hint={text("accountScaleHint")}>
                  <Segmented
                    aria-label={text("accountScale")}
                    value={scaleDraft}
                    options={SCALE_OPTIONS}
                    onValueChange={(value) => setScaleDraft(restoredScale(value))}
                  />
                </Field>
                {(upload.error || save.error || signOut.error) && (
                  <ErrorNotice
                    error={upload.error ?? save.error ?? signOut.error}
                    keyFor={(failure) => (failure.code === "conflict" ? "accountEmailTaken" : undefined)}
                  />
                )}
              </div>
            </div>
          </Card.Body>
          <Card.Footer
            actions={
              <>
                <Button
                  type="button"
                  tone="danger"
                  onClick={signOutOnce}
                  disabled={accountPending}
                  icon={<SignOutIcon weight="duotone" />}
                >
                  {signOut.isPending ? text("signOutPending") : text("signOut")}
                </Button>
                <Button
                  type="button"
                  onClick={dismiss}
                  disabled={accountPending}
                  icon={<XIcon weight="duotone" />}
                >
                  {text("cancel")}
                </Button>
                <Button
                  type="submit"
                  tone="primary"
                  disabled={avatarPending}
                  icon={<FloppyDiskIcon weight="duotone" />}
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
