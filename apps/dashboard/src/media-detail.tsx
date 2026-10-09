import { MaxLength, type MediaDetail, type SaveMediaMetadataBody } from "@layered/schemas";
import { Button, Card, Field, Input, Row, Switch, Textarea } from "@layered/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { FocalPointEditor } from "./focal-point.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaDeleteDialog, MediaUses } from "./media-deletion.js";
import { CardDialog } from "./modal.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";

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
  const [deleting, setDeleting] = useState(false);
  // The fields show the language the dialog's switch has chosen. The other
  // language's alt text and caption stay in the draft and are saved with it.
  const language = useTextLanguage();
  const translation = value.translations.find((candidate) => candidate.language === language);
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
          {translation && (
            <>
              <Field label={text("mediaAlt")} htmlFor={`${prefix}-${language}-alt`}>
                <Input
                  id={`${prefix}-${language}-alt`}
                  lang={language}
                  value={translation.altText ?? ""}
                  disabled={translation.altText === ""}
                  maxLength={MaxLength.Paragraph}
                  onChange={(event) => description(language, "altText", event.target.value || null)}
                />
              </Field>
              <Field.Inline label={text("mediaDecorative")} htmlFor={`${prefix}-${language}-decorative`}>
                <Switch
                  id={`${prefix}-${language}-decorative`}
                  aria-label={text("mediaDecorative")}
                  checked={translation.altText === ""}
                  onCheckedChange={(decorative) => description(language, "altText", decorative ? "" : null)}
                />
              </Field.Inline>
              <Field label={text("mediaCaption")} htmlFor={`${prefix}-${language}-caption`}>
                <Textarea
                  id={`${prefix}-${language}-caption`}
                  lang={language}
                  value={translation.caption ?? ""}
                  maxLength={MaxLength.Paragraph}
                  onChange={(event) => description(language, "caption", event.target.value || null)}
                />
              </Field>
            </>
          )}
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
          <MediaUses uses={detail.uses} />
          {save.isError && <ErrorNotice error={save.error} />}
        </form>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button tone="danger" onClick={() => setDeleting(true)} disabled={save.isPending}>
              {text("mediaDelete")}
            </Button>
            <Button onClick={onClose}>{text("cancel")}</Button>
            <Button type="submit" form={formId} tone="primary" disabled={save.isPending}>
              {text(save.isPending ? "savePending" : "save")}
            </Button>
          </>
        }
      />
      {deleting && (
        <MediaDeleteDialog detail={detail} onClose={() => setDeleting(false)} onDeleted={onClose} />
      )}
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
    <Translated>
      <CardDialog labelId={titleId} onClose={onClose}>
        <Card.Header
          className="media-detail__header"
          id={titleId}
          title={detail.data?.slug ?? text("mediaDetails")}
          actions={<Translated.Switch />}
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
    </Translated>
  );
}
