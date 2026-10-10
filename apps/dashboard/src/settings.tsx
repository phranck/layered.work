import { ANALYTICS_ORIGIN } from "@layered/policy";
import {
  analyticsSettings,
  MaxLength,
  mailSettings,
  type SettingsView,
  type SiteSettings,
  siteSettings,
} from "@layered/schemas";
import { Button, Card, Field, Input, Segmented } from "@layered/ui";
import { FloppyDiskIcon, ImagesIcon, PaperPlaneTiltIcon, XIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import type { SettingsGroups } from "./api.js";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import type { DashboardArea } from "./routes.js";
import { useSaveShortcut } from "./save-shortcut.js";
import { useAccount } from "./session-queries.js";
import { contentLanguageOptions, Translated } from "./translated.js";

/**
 * The settings of the site as a whole, one screen per group.
 *
 * The sidebar's System group already names three places: SMTP2GO, Umami and
 * Settings. Each of them is one group here, in one card with its own save, so a
 * change to the mail sender cannot be lost to an unrelated mistake in the site
 * title. Every author can read them; only the owner can change them.
 */

/** How long an Umami website id is: a UUID, hyphens included. */
const UUID_LENGTH = 36;

/** Anything that checks a draft and says which fields failed. */
interface DraftSchema<Value> {
  safeParse(
    value: unknown,
  ): { success: true; data: Value } | { success: false; error: { issues: { path: PropertyKey[] }[] } };
}

/** Props for one group's card. */
interface SettingsCardProps<Group extends keyof SettingsGroups> {
  group: Group;
  title: string;
  /** What is stored now, which the draft starts from. */
  saved: SettingsGroups[Group];
  schema: DraftSchema<SettingsGroups[Group]>;
  /** The sentence for a failing field, by the first segment of its path. */
  reasons: Partial<Record<string, DashboardStringKey>>;
  /** Draws the fields from the draft. `update` replaces part of it. */
  children: (
    draft: SettingsGroups[Group],
    update: (change: Partial<SettingsGroups[Group]>) => void,
    editable: boolean,
  ) => ReactNode;
  /** Further actions beside save, told whether the draft differs from what is stored. */
  actions?: (dirty: boolean) => ReactNode;
  /** A line in the footer, such as why one of those actions cannot be used yet. */
  note?: (dirty: boolean) => string | undefined;
  /**
   * Draws the card as one that opens and closes under its header, which is how
   * a group of settings stands on a screen that is about something else.
   */
  collapse?: { open: boolean; onOpenChange: (open: boolean) => void };
  /** Controls at the end of the header, such as the language switch of a card holding bilingual texts. */
  headerActions?: ReactNode;
}

/**
 * One group of settings in a card: its fields, the reasons a draft cannot be
 * saved, and a save that stores the whole group.
 *
 * The draft is checked against the same schema the API validates with before
 * anything is sent, so the reader learns which field is wrong and why. The API
 * checks it again and says only that the request was refused, which is the
 * backstop rather than the explanation.
 */
export function SettingsCard<Group extends keyof SettingsGroups>({
  group,
  title,
  saved,
  schema,
  reasons,
  children,
  actions,
  note,
  collapse,
  headerActions,
}: SettingsCardProps<Group>) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { text } = useDashboardLanguage();
  const account = useAccount();
  const editable = account.data?.role === "owner";
  const [draft, setDraft] = useState(saved);
  const [problems, setProblems] = useState<DashboardStringKey[]>([]);
  const { notify, notifyError } = useNotify();
  const save = useMutation({
    mutationFn: (value: SettingsGroups[Group]) => api.saveSettings(group, value),
    onError: (error) => notifyError(error),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKeys.settings, view);
      notify({ tone: "success", message: text("saved") });
    },
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const formId = `settings-${group}`;
  const form = useRef<HTMLFormElement>(null);

  // Command-S submits the form exactly as the Save button does, checks included,
  // and does nothing whilst that button is disabled.
  useSaveShortcut(() => {
    if (editable && dirty && !save.isPending) form.current?.requestSubmit();
  });

  const update = (change: Partial<SettingsGroups[Group]>) => {
    setDraft((current) => ({ ...current, ...change }));
    setProblems([]);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      const keys = parsed.error.issues.map(
        (issue) => reasons[String(issue.path[0])] ?? "errorInvalidRequest",
      );
      setProblems([...new Set(keys)]);
      return;
    }
    save.mutate(parsed.data, { onSuccess: () => setDraft(parsed.data) });
  };

  const content = (
    <>
      <Card.Body>
        <form ref={form} id={formId} className="settings-form" onSubmit={submit} noValidate>
          {children(draft, update, editable)}
          {problems.length > 0 && (
            <ul className="dashboard-error settings-form__problems" role="alert">
              {problems.map((key) => (
                <li key={key}>{text(key)}</li>
              ))}
            </ul>
          )}
        </form>
      </Card.Body>
      <Card.Footer
        note={editable ? note?.(dirty) : text("ownerOnly")}
        actions={
          <>
            {actions?.(dirty)}
            <Button
              type="submit"
              form={formId}
              tone="primary"
              disabled={!editable || !dirty || save.isPending}
              icon={<FloppyDiskIcon weight="duotone" />}
            >
              {save.isPending ? text("savePending") : text("save")}
            </Button>
          </>
        }
      />
    </>
  );
  return collapse ? (
    <Card.Collapsible
      title={title}
      actions={headerActions}
      open={collapse.open}
      onOpenChange={collapse.onOpenChange}
    >
      {content}
    </Card.Collapsible>
  ) : (
    <Card>
      <Card.Header title={title} actions={headerActions} />
      {content}
    </Card>
  );
}

/**
 * The settings once they have loaded, or the failure that stopped them.
 *
 * @param render - Draws the screen from the loaded settings.
 */
function WithSettings({ area, render }: { area: DashboardArea; render: (view: SettingsView) => ReactNode }) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: api.fetchSettings });
  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      {settings.isError && <ErrorNotice error={settings.error} />}
      {settings.data && render(settings.data)}
    </>
  );
}

/** Props for a setting that names one picture from the library. */
interface PictureSettingProps {
  label: string;
  hint: string;
  /** What the field says whilst no picture is chosen. */
  none: string;
  mediaId: string | null;
  /** Where the stored picture can be shown from, as the API answered. */
  savedUrl: string | null;
  editable: boolean;
  onChange: (mediaId: string | null) => void;
}

/**
 * A setting that names one library picture: the picture, or what stands in for
 * none, with a button that removes it and one that opens the picker.
 *
 * The address of a picture chosen here is held here, because the API only knows
 * the address of the one already saved. Saving re-keys the card, which starts
 * this again from the saved address.
 */
function PictureSetting({ label, hint, none, mediaId, savedUrl, editable, onChange }: PictureSettingProps) {
  const { text } = useDashboardLanguage();
  const [picking, setPicking] = useState(false);
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);
  return (
    <Field label={label} hint={hint}>
      <div className="media-field">
        {mediaId ? (
          <img src={chosenUrl ?? savedUrl ?? ""} alt="" />
        ) : (
          <span className="media-field__name">{none}</span>
        )}
        <span className="actions media-field__actions">
          {mediaId && (
            <Button disabled={!editable} icon={<XIcon weight="duotone" />} onClick={() => onChange(null)}>
              {text("remove")}
            </Button>
          )}
          <Button
            disabled={!editable}
            icon={<ImagesIcon weight="duotone" />}
            onClick={() => setPicking(true)}
          >
            {text("mediaPicker")}
          </Button>
        </span>
      </div>
      {picking && (
        <MediaPicker
          onCancel={() => setPicking(false)}
          onChoose={(item) => {
            onChange(item.id);
            setChosenUrl(item.url);
            setPicking(false);
          }}
        />
      )}
    </Field>
  );
}

/** The site's name, its footer line, its language, its fallback sharing picture and its watermark. */
export function SiteSettingsScreen({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  return (
    <WithSettings
      area={area}
      render={(view) => {
        const { socialImageUrl, watermarkUrl, ...saved } = view.site;
        return (
          <Translated>
            <SettingsCard<"site">
              key={JSON.stringify(saved)}
              group="site"
              title={text("settingsSite")}
              saved={saved}
              schema={siteSettings}
              reasons={{ title: "invalidTitle", footerLine: "invalidFooterLine" }}
              headerActions={<Translated.Switch />}
            >
              {(draft, update, editable) => (
                <>
                  <Translated.Field
                    id="site-title"
                    label={text("siteTitle")}
                    value={draft.title}
                    maxLength={MaxLength.Line}
                    disabled={!editable}
                    onChange={(title) => update({ title })}
                  />
                  <Translated.Field
                    id="footer-line"
                    label={text("footerLine")}
                    hint={text("footerLineHint")}
                    value={draft.footerLine}
                    maxLength={MaxLength.Paragraph}
                    disabled={!editable}
                    onChange={(footerLine) => update({ footerLine })}
                  />
                  <Field label={text("defaultLanguage")} hint={text("defaultLanguageHint")}>
                    <Segmented
                      aria-label={text("defaultLanguage")}
                      value={draft.defaultLanguage}
                      options={contentLanguageOptions(!editable)}
                      onValueChange={(value) =>
                        update({ defaultLanguage: value as SiteSettings["defaultLanguage"] })
                      }
                    />
                  </Field>
                  <PictureSetting
                    label={text("socialImage")}
                    hint={text("socialImageHint")}
                    none={text("socialImageNone")}
                    mediaId={draft.socialImageMediaId}
                    savedUrl={socialImageUrl}
                    editable={editable}
                    onChange={(socialImageMediaId) => update({ socialImageMediaId })}
                  />
                  <PictureSetting
                    label={text("watermark")}
                    hint={text("watermarkHint")}
                    none={text("watermarkWordmark")}
                    mediaId={draft.watermarkMediaId}
                    savedUrl={watermarkUrl}
                    editable={editable}
                    onChange={(watermarkMediaId) => update({ watermarkMediaId })}
                  />
                </>
              )}
            </SettingsCard>
          </Translated>
        );
      }}
    />
  );
}

/** Who mail comes from, whether a key is there to send it, and a test message. */
export function MailSettingsScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const test = useMutation({ mutationFn: api.sendTestMail });
  return (
    <WithSettings
      area={area}
      render={(view) => {
        const { apiKeyConfigured, ...saved } = view.mail;
        return (
          <SettingsCard<"mail">
            key={JSON.stringify(saved)}
            group="mail"
            title={text("settingsMail")}
            saved={saved}
            schema={mailSettings}
            reasons={{ senderAddress: "invalidSenderAddress", senderName: "invalidSenderName" }}
            note={(dirty) =>
              !apiKeyConfigured
                ? text("testMailNeedsKey")
                : dirty
                  ? text("testMailNeedsSave")
                  : !saved.senderAddress
                    ? text("testMailNeedsSender")
                    : undefined
            }
            actions={(dirty) => (
              <Button
                disabled={!apiKeyConfigured || dirty || !saved.senderAddress || test.isPending}
                icon={<PaperPlaneTiltIcon weight="duotone" />}
                onClick={() => test.mutate()}
              >
                {test.isPending ? text("testMailPending") : text("testMail")}
              </Button>
            )}
          >
            {(draft, update, editable) => (
              <>
                <Field label={text("mailKey")} hint={text("mailKeyHint")}>
                  <span className="badge" data-status={apiKeyConfigured ? "public" : "draft"}>
                    {apiKeyConfigured ? text("mailKeySet") : text("mailKeyMissing")}
                  </span>
                </Field>
                <div className="settings-form__pair">
                  <Field label={text("senderAddress")} htmlFor="sender-address">
                    <Input
                      id="sender-address"
                      type="email"
                      value={draft.senderAddress ?? ""}
                      maxLength={MaxLength.Line}
                      disabled={!editable}
                      onChange={(event) => update({ senderAddress: event.target.value.trim() || null })}
                    />
                  </Field>
                  <Field label={text("senderName")} htmlFor="sender-name">
                    <Input
                      id="sender-name"
                      value={draft.senderName}
                      maxLength={MaxLength.Line}
                      disabled={!editable}
                      onChange={(event) => update({ senderName: event.target.value })}
                    />
                  </Field>
                </div>
                <p className="settings-form__note">{text("mailDomainHint")}</p>
                {test.isError && <ErrorNotice error={test.error} />}
                {test.data && (
                  <div className="settings-form__outcome" role="status" data-accepted={test.data.accepted}>
                    <p>
                      {test.data.accepted
                        ? text("testMailAccepted", test.data.recipient)
                        : text("testMailRefused", test.data.recipient)}
                    </p>
                    <p className="settings-form__answer">
                      {text("testMailAnswer")}: <q>{test.data.answer}</q>
                    </p>
                  </div>
                )}
              </>
            )}
          </SettingsCard>
        );
      }}
    />
  );
}

/** The Umami instance, stated, and the website id the site reports to. */
export function AnalyticsSettingsScreen({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  return (
    <WithSettings
      area={area}
      render={(view) => (
        <SettingsCard<"analytics">
          key={JSON.stringify(view.analytics)}
          group="analytics"
          title={text("settingsAnalytics")}
          saved={view.analytics}
          schema={analyticsSettings}
          reasons={{ umamiWebsiteId: "invalidWebsiteId" }}
        >
          {(draft, update, editable) => (
            <>
              <Field label={text("umamiInstance")}>
                <code className="settings-form__value">{ANALYTICS_ORIGIN}</code>
              </Field>
              <Field
                label={text("umamiWebsiteId")}
                htmlFor="umami-website-id"
                hint={text("umamiWebsiteIdHint")}
              >
                <Input
                  id="umami-website-id"
                  className="settings-form__code"
                  value={draft.umamiWebsiteId ?? ""}
                  maxLength={UUID_LENGTH}
                  spellCheck={false}
                  disabled={!editable}
                  onChange={(event) => update({ umamiWebsiteId: event.target.value.trim() || null })}
                />
              </Field>
            </>
          )}
        </SettingsCard>
      )}
    />
  );
}
