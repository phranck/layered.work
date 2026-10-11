import { ANALYTICS_ORIGIN } from "@layered/policy";
import {
  analyticsSettings,
  MaxLength,
  mailSettings,
  type SettingsGroup,
  type SettingsValues,
  type SettingsView,
  type SiteSettings,
  siteSettings,
} from "@layered/schemas";
import { Badge, Card, Field, Input, Segmented } from "@layered/ui";
import { type ReactNode, useRef, useState } from "react";
import { AccessTokensCard } from "./access-tokens.js";
import { ActionButton } from "./action-button.js";
import { ScreenTitle } from "./app-bar-slots.js";
import type { DraftSchema } from "./checked-draft.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MailTestOutcome } from "./mail-test-outcome.js";
import { useNotify } from "./notifications.js";
import { PictureField } from "./picture-field.js";
import { QueryStates } from "./query-states.js";
import type { DashboardArea } from "./routes.js";
import { useSaveShortcut } from "./save-shortcut.js";
import { useAccount } from "./session-queries.js";
import {
  checkedSettings,
  testMailBlocker,
  useSaveSettings,
  useSendTestMail,
  useSettings,
} from "./settings-query.js";
import { sameValue, useStoredRevision } from "./stored-draft.js";
import { contentLanguageOptions, Translated } from "./translated.js";

/**
 * The settings of the site as a whole, one screen per group.
 *
 * The sidebar's System group already names three places: SMTP2GO, Umami and
 * Settings. Each of them is one group here, in one card with its own save, so a
 * change to the mail sender cannot be lost to an unrelated mistake in the site
 * title. Every author can read them; only the owner can change them.
 */

/** Props for one group's card. */
interface SettingsCardProps<Group extends SettingsGroup> {
  group: Group;
  title: string;
  /** What is stored now, which the draft starts from. */
  saved: SettingsValues[Group];
  schema: DraftSchema<SettingsValues[Group]>;
  /** The sentence for a failing field, by the first segment of its path. */
  reasons: Partial<Record<string, DashboardStringKey>>;
  /** Draws the fields from the draft. `update` replaces part of it. */
  children: (
    draft: SettingsValues[Group],
    update: (change: Partial<SettingsValues[Group]>) => void,
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
 *
 * The card starts again from what is stored whenever that changes, so after a
 * save, or a change made elsewhere, its fields show what is stored.
 */
export function SettingsCard<Group extends SettingsGroup>(props: SettingsCardProps<Group>) {
  const revision = useStoredRevision(props.saved);
  return <SettingsCardDraft key={revision} {...props} />;
}

/** The card of `SettingsCard`, holding one draft of what was stored when it opened. */
function SettingsCardDraft<Group extends SettingsGroup>({
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
  const { text } = useDashboardLanguage();
  const account = useAccount();
  const editable = account.data?.role === "owner";
  const [draft, setDraft] = useState(saved);
  const [problems, setProblems] = useState<DashboardStringKey[]>([]);
  const { notify, notifyError } = useNotify();
  const save = useSaveSettings(group, {
    onError: notifyError,
    onSuccess: (_view, value) => {
      setDraft(value);
      notify({ tone: "success", message: text("saved") });
    },
  });
  const dirty = !sameValue(draft, saved);
  const formId = `settings-${group}`;
  const form = useRef<HTMLFormElement>(null);

  // Command-S submits the form exactly as the Save button does, checks included,
  // and does nothing while that button is disabled.
  useSaveShortcut(() => {
    if (editable && dirty && !save.isPending) form.current?.requestSubmit();
  });

  const update = (change: Partial<SettingsValues[Group]>) => {
    setDraft((current) => ({ ...current, ...change }));
    setProblems([]);
  };

  const content = (
    <>
      <form
        ref={form}
        id={formId}
        className="dialog-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const checked = checkedSettings(schema, draft, reasons);
          if ("problems" in checked) setProblems(checked.problems);
          else save.mutate(checked.value);
        }}
      >
        <Card.Stack>
          {children(draft, update, editable)}
          {problems.length > 0 && <ErrorNotice message={problems.map((key) => text(key))} />}
        </Card.Stack>
      </form>
      <Card.Footer
        note={editable ? note?.(dirty) : text("ownerOnly")}
        actions={
          <>
            {actions?.(dirty)}
            <ActionButton
              action="save"
              type="submit"
              form={formId}
              tone="primary"
              disabled={!editable || !dirty || save.isPending}
            >
              {save.isPending ? text("savePending") : text("save")}
            </ActionButton>
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
 * The settings once they have loaded, or a card saying they are loading or
 * what stopped them.
 *
 * A settings screen is a form standing alone, so its cards stop at the form
 * measure rather than stretching across the content area.
 *
 * @param render - Draws the screen from the loaded settings.
 */
function WithSettings({ area, render }: { area: DashboardArea; render: (view: SettingsView) => ReactNode }) {
  const { text } = useDashboardLanguage();
  const settings = useSettings();
  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <div className="settings-screen">
        {settings.data ? (
          render(settings.data)
        ) : (
          <Card>
            <QueryStates query={settings}>{() => null}</QueryStates>
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * The site's name, its footer line, its language, its fallback sharing picture
 * and its watermark, and for the owner the API tokens an agent writes with.
 */
export function SiteSettingsScreen({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  const owner = useAccount().data?.role === "owner";
  return (
    <WithSettings
      area={area}
      render={(view) => (
        <>
          <Translated>
            <SettingsCard<"site">
              group="site"
              title={text("settingsSite")}
              saved={view.site}
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
                  <PictureField
                    label={text("socialImage")}
                    hint={text("socialImageHint")}
                    none={text("socialImageNone")}
                    mediaId={draft.socialImageMediaId}
                    shape="sharing"
                    editable={editable}
                    onChange={(socialImageMediaId) => update({ socialImageMediaId })}
                  />
                  <PictureField
                    label={text("watermark")}
                    hint={text("watermarkHint")}
                    none={text("watermarkWordmark")}
                    mediaId={draft.watermarkMediaId}
                    shape="whole"
                    editable={editable}
                    onChange={(watermarkMediaId) => update({ watermarkMediaId })}
                  />
                </>
              )}
            </SettingsCard>
          </Translated>
          {owner && <AccessTokensCard />}
        </>
      )}
    />
  );
}

/** Who mail comes from, whether a key is there to send it, and a test message. */
export function MailSettingsScreen({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  const test = useSendTestMail();
  return (
    <WithSettings
      area={area}
      render={(view) => {
        const { apiKeyConfigured, ...saved } = view.mail;
        return (
          <SettingsCard<"mail">
            group="mail"
            title={text("settingsMail")}
            saved={saved}
            schema={mailSettings}
            reasons={{ senderAddress: "invalidSenderAddress", senderName: "invalidSenderName" }}
            note={(dirty) => {
              const blocker = testMailBlocker(apiKeyConfigured, dirty, saved.senderAddress);
              return blocker && text(blocker);
            }}
            actions={(dirty) => (
              <ActionButton
                action="send"
                disabled={
                  testMailBlocker(apiKeyConfigured, dirty, saved.senderAddress) !== undefined ||
                  test.isPending
                }
                onClick={() => test.mutate()}
              >
                {test.isPending ? text("testMailPending") : text("testMail")}
              </ActionButton>
            )}
          >
            {(draft, update, editable) => (
              <>
                <Field label={text("mailKey")} hint={text("mailKeyHint")}>
                  <Badge tone={apiKeyConfigured ? "success" : "warning"}>
                    {apiKeyConfigured ? text("mailKeySet") : text("mailKeyMissing")}
                  </Badge>
                </Field>
                <div className="field-row">
                  <Field label={text("senderAddress")} htmlFor="sender-address">
                    <Input
                      id="sender-address"
                      type="email"
                      value={draft.senderAddress ?? ""}
                      maxLength={MaxLength.Email}
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
                {test.data && <MailTestOutcome result={test.data} />}
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
                  className="input--code"
                  value={draft.umamiWebsiteId ?? ""}
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
