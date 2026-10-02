import { Button } from "@layered/ui";
import { CheckCircleIcon, InfoIcon, WarningIcon, WarningOctagonIcon, XIcon } from "@layered/ui/icons";
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardApiError } from "./api.js";
import { HeaderCenter } from "./app-bar-slots.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { errorKey } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";

/**
 * What just happened, said in one place: the centre of the dashboard's bar.
 *
 * One notification at a time, because a stack of them is a log nobody reads. A
 * new one replaces the one shown. Success and information leave by themselves
 * after a few seconds, and stay whilst the pointer rests on them; a warning or
 * a failure stays until it is closed, because a failure read in passing is a
 * failure missed.
 *
 * A notification is an event. The state of what is open, such as unsaved
 * changes or when it was last saved, stays beside the thing it describes.
 */

/** The four tones, the status colours the design system names. */
export type NotificationTone = "success" | "info" | "warning" | "danger";

/** One notification: what kind it is, what it says, and a line beneath it where there is one. */
export interface Notification {
  tone: NotificationTone;
  message: string;
  detail?: string;
}

/** How long a notification that leaves by itself stays, in milliseconds. */
export const NOTIFICATION_VISIBLE_MS = 4000;

/** How long it takes to fade, matching the workbench's `--duration`, in milliseconds. */
const NOTIFICATION_FADE_MS = 160;

/** Whether a notification of this tone leaves by itself. */
const leavesByItself = (tone: NotificationTone) => tone === "success" || tone === "info";

/** What a screen can say. */
interface Notify {
  /** Shows a notification. */
  notify: (notification: Notification) => void;
  /**
   * Shows a failure, said as the dashboard says that failure everywhere, with
   * the request id beneath it where the API returned one.
   */
  notifyError: (
    error: unknown,
    fallback?: DashboardStringKey,
    keyFor?: (error: DashboardApiError) => DashboardStringKey | undefined,
  ) => void;
}

const NotifyContext = createContext<Notify>({ notify: () => {}, notifyError: () => {} });

/** The icon each tone is marked with, so the tone is not carried by colour alone. */
const ICONS = { success: CheckCircleIcon, info: InfoIcon, warning: WarningIcon, danger: WarningOctagonIcon };

/**
 * Holds the notification shown, and puts it into the bar.
 *
 * @param children - The dashboard's frame.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { text } = useDashboardLanguage();
  const [shown, setShown] = useState<(Notification & { id: number; leaving: boolean }) | null>(null);
  const next = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const leave = useCallback(() => {
    clearTimeout(timer.current);
    setShown((current) => (current ? { ...current, leaving: true } : current));
    timer.current = setTimeout(() => setShown(null), NOTIFICATION_FADE_MS);
  }, []);

  const schedule = useCallback(
    (tone: NotificationTone) => {
      clearTimeout(timer.current);
      if (leavesByItself(tone)) timer.current = setTimeout(leave, NOTIFICATION_VISIBLE_MS);
    },
    [leave],
  );

  const notify = useCallback(
    (notification: Notification) => {
      next.current += 1;
      setShown({ ...notification, id: next.current, leaving: false });
      schedule(notification.tone);
    },
    [schedule],
  );

  const notifyError = useCallback<Notify["notifyError"]>(
    (error, fallback, keyFor) => {
      const { key, known } = errorKey(error, fallback, keyFor);
      notify({
        tone: "danger",
        message: text(key),
        detail: known?.id ? `${text("errorId")}: ${known.id}` : undefined,
      });
    },
    [notify, text],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo(() => ({ notify, notifyError }), [notify, notifyError]);
  const urgent = shown && !leavesByItself(shown.tone);
  const Icon = shown ? ICONS[shown.tone] : null;

  return (
    <NotifyContext value={value}>
      {children}
      <HeaderCenter>
        {/* Two regions that are always there, so a reader is told as soon as
            text arrives in one: politely for news, at once for trouble. */}
        <div className="notification-region" aria-live="polite" aria-atomic="true">
          {shown && !urgent && `${shown.message}${shown.detail ? ` ${shown.detail}` : ""}`}
        </div>
        <div className="notification-region" aria-live="assertive" aria-atomic="true">
          {shown && urgent && `${shown.message}${shown.detail ? ` ${shown.detail}` : ""}`}
        </div>
        {shown && Icon && (
          <div
            key={shown.id}
            className="notification"
            data-tone={shown.tone}
            data-leaving={shown.leaving ? "" : undefined}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={() => !shown.leaving && schedule(shown.tone)}
          >
            <Icon className="notification__icon" />
            <span className="notification__text">
              <span className="notification__message">{shown.message}</span>
              {shown.detail && <span className="notification__detail">{shown.detail}</span>}
            </span>
            {urgent && (
              <Button.Icon
                className="notification__close"
                label={text("close")}
                icon={<XIcon />}
                onClick={leave}
              />
            )}
          </div>
        )}
      </HeaderCenter>
    </NotifyContext>
  );
}

/** What a screen uses to say what just happened. */
export function useNotify(): Notify {
  return use(NotifyContext);
}
