import { MaxLength, type MediaDetail, type SaveMediaMetadataBody } from "@layered/schemas";
import { Button, Card, Field, Input, Row, Switch, Textarea } from "@layered/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { FocalPointEditor } from "./focal-point.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";

const ENTRY_AREA = { post: "posts", page: "pages", project: "projects" } as const;
function MediaMetadataEditor({ detail, onClose }: { detail: MediaDetail; onClose: () => void }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const [value, setValue] = useState<SaveMediaMetadataBody>({
    focalPoint: detail.focalPoint,
    translations: (["en", "de"] as const).map((language) => ({ language, ...detail.translations[language] })),
  });
  const formId = useId();
  const prefix = useId();
  const save = useMutation({
    mutationFn: () =>
      api.saveMediaMetadata(detail.id, {
        ...value,
        translations: value.translations.map((translation) => ({
          ...translation,
          altText:
            translation.altText === null || translation.altText === ""
              ? translation.altText
              : translation.altText.trim() || null,
          caption: translation.caption?.trim() || null,
        })),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["media"] });
      await client.invalidateQueries({ queryKey: ["account-media"] });
      onClose();
    },
  });
  function description(language: "en" | "de", field: "altText" | "caption", next: string | null) {
    setValue((current) => ({
      ...current,
      translations: current.translations.map((translation) =>
        translation.language === language ? { ...translation, [field]: next } : translation,
      ),
    }));
  }
  return (
    <>
      <Card.Body>
        <form
          id={formId}
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <p>
            {detail.mimeType} · {detail.byteSize} B ·{" "}
            <time dateTime={detail.uploadedAt}>{detail.uploadedAt.slice(0, 10)}</time>
          </p>
          {detail.width && detail.height && (
            <p>
              {text("mediaDimensions")}: {detail.width} × {detail.height}
            </p>
          )}
          {value.translations.map((translation) => {
            const language = text(translation.language === "de" ? "languageDe" : "languageEn");
            return (
              <fieldset key={translation.language} className="settings-form media-detail__language">
                <legend>{language}</legend>
                <Field label={text("mediaAlt", language)} htmlFor={`${prefix}-${translation.language}-alt`}>
                  <Input
                    id={`${prefix}-${translation.language}-alt`}
                    value={translation.altText ?? ""}
                    disabled={translation.altText === ""}
                    maxLength={MaxLength.Paragraph}
                    onChange={(event) =>
                      description(translation.language, "altText", event.target.value || null)
                    }
                  />
                </Field>
                <Field.Inline
                  label={text("mediaDecorative", language)}
                  htmlFor={`${prefix}-${translation.language}-decorative`}
                >
                  <Switch
                    id={`${prefix}-${translation.language}-decorative`}
                    aria-label={text("mediaDecorative", language)}
                    checked={translation.altText === ""}
                    onCheckedChange={(decorative) =>
                      description(translation.language, "altText", decorative ? "" : null)
                    }
                  />
                </Field.Inline>
                <Field
                  label={text("mediaCaption", language)}
                  htmlFor={`${prefix}-${translation.language}-caption`}
                >
                  <Textarea
                    id={`${prefix}-${translation.language}-caption`}
                    value={translation.caption ?? ""}
                    maxLength={MaxLength.Paragraph}
                    onChange={(event) =>
                      description(translation.language, "caption", event.target.value || null)
                    }
                  />
                </Field>
              </fieldset>
            );
          })}
          {detail.kind === "image" && detail.url && (
            <FocalPointEditor
              src={detail.url}
              point={value.focalPoint}
              onChange={(focalPoint) => setValue((current) => ({ ...current, focalPoint }))}
            />
          )}
          <section>
            <h3>{text("mediaVariants")}</h3>
            <p>
              {text(
                (
                  {
                    queued: "mediaQueued",
                    processing: "mediaProcessing",
                    ready: "mediaReady",
                    failed: "mediaFailed",
                  } as const
                )[detail.processing.state],
              )}
            </p>
            {detail.processing.errorId && (
              <p>
                {text("errorId")}: {detail.processing.errorId}
              </p>
            )}
            <div className="media-detail__variants">
              {detail.processing.variants.map((variant) => (
                <Row.Bare key={`${variant.format}-${variant.width}`}>
                  <Row.Text
                    title={`${variant.format.toUpperCase()} · ${variant.width} × ${variant.height}`}
                    note={`${variant.byteSize} B`}
                  />
                </Row.Bare>
              ))}
            </div>
          </section>
          <section>
            <h3>{text("mediaUses")}</h3>
            {!detail.uses.length && <p>{text("mediaUnused")}</p>}
            <ul>
              {detail.uses.map((use) => (
                <li key={use.id}>
                  <a href={`/${ENTRY_AREA[use.kind]}/${use.id}`}>
                    {use.title} ({use.language.toUpperCase()})
                  </a>
                </li>
              ))}
            </ul>
          </section>
          {save.isError && <ErrorNotice error={save.error} />}
        </form>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button onClick={onClose}>{text("cancel")}</Button>
            <Button type="submit" form={formId} tone="primary" disabled={save.isPending}>
              {text(save.isPending ? "savePending" : "save")}
            </Button>
          </>
        }
      />
    </>
  );
}
export function MediaDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const titleId = useId();
  const detail = useQuery({
    queryKey: ["media", "detail", id],
    queryFn: () => api.fetchMediaDetail(id),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.processing.state === "queued" || query.state.data?.processing.state === "processing"
        ? 2_000
        : false,
  });
  return (
    <CardDialog labelId={titleId} onClose={onClose}>
      <Card.Header
        className="media-detail__header"
        id={titleId}
        title={detail.data?.slug ?? text("mediaDetails")}
      />
      {detail.isPending && (
        <Card.Body>
          <p>{text("loading")}</p>
        </Card.Body>
      )}
      {detail.isError && (
        <Card.Body>
          <ErrorNotice error={detail.error} />
        </Card.Body>
      )}
      {detail.data && <MediaMetadataEditor key={id} detail={detail.data} onClose={onClose} />}
    </CardDialog>
  );
}
