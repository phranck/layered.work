import {
  type ContentLanguage,
  MaxLength,
  type MediaDetail,
  unsplashCreditLine,
  WATERMARK_ANCHORS,
} from "@layered/schemas";
import { Button, Card, Field, Input, MediaCredit, Select, Switch } from "@layered/ui";
import { FloppyDiskIcon, TrashIcon, XIcon } from "@layered/ui/icons";
import { useId, useState } from "react";
import { ErrorNotice } from "./error-notice.js";
import { FocalPointEditor } from "./focal-point.js";
import { useDashboardLanguage } from "./language-context.js";
import { MarkdownField } from "./markdown-field.js";
import { MediaDeleteDialog, MediaUses } from "./media-deletion.js";
import { PROCESSING_TEXT } from "./media-processing.js";
import {
  metadataDraftOf,
  useMediaDetail,
  useSaveMediaMetadata,
  WATERMARK_ANCHOR_TEXT,
} from "./media-query.js";
import { CardDialog } from "./modal.js";
import { Table } from "./table.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";

/** The value the select uses for a picture without a watermark, since a select value cannot be null. */
const NO_WATERMARK = "";

/**
 * A file's descriptions, focal point and watermark, with what the library
 * knows about it: its size, its variants and where it is used.
 *
 * @param detail - The file as the API returned it.
 * @param onClose - Closes the dialog, after a save as well.
 */
function MediaMetadataEditor({ detail, onClose }: { detail: MediaDetail; onClose: () => void }) {
  const { text, language: interfaceLanguage } = useDashboardLanguage();
  const [value, setValue] = useState(() => metadataDraftOf(detail));
  const formId = useId();
  const prefix = useId();
  const [deleting, setDeleting] = useState(false);
  // The fields show the language the dialog's switch has chosen. The other
  // language's alt text and caption stay in the draft and are saved with it.
  const language = useTextLanguage();
  const translation = value.translations.find((candidate) => candidate.language === language);
  const save = useSaveMediaMetadata(detail, { onSuccess: () => onClose() });
  function description(language: ContentLanguage, field: "altText" | "caption", next: string | null) {
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
            save.mutate(value);
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
          {detail.credit && <MediaCredit credit={unsplashCreditLine(detail.credit, interfaceLanguage)} />}
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
              <MarkdownField
                id={`${prefix}-${language}-caption`}
                label={text("mediaCaption")}
                lang={language}
                profile="inline"
                value={translation.caption ?? ""}
                maxLength={MaxLength.Paragraph}
                onChange={(caption) => description(language, "caption", caption || null)}
              />
            </>
          )}
          {detail.kind === "image" && detail.url && (
            <FocalPointEditor
              src={detail.url}
              point={value.focalPoint}
              onChange={(focalPoint) => setValue((current) => ({ ...current, focalPoint }))}
            />
          )}
          {/* A picture from Unsplash has no bytes here to lay a mark into. */}
          {detail.kind === "image" && detail.url && !detail.credit && (
            <Field label={text("watermark")} htmlFor={`${prefix}-watermark`}>
              <Select
                id={`${prefix}-watermark`}
                value={value.watermark ?? NO_WATERMARK}
                options={[
                  { value: NO_WATERMARK, label: text("watermarkNone") },
                  ...WATERMARK_ANCHORS.map((anchor) => ({
                    value: anchor,
                    label: text(WATERMARK_ANCHOR_TEXT[anchor]),
                  })),
                ]}
                onChange={(event) => {
                  const chosen = event.target.value;
                  setValue((current) => ({
                    ...current,
                    watermark: WATERMARK_ANCHORS.find((anchor) => anchor === chosen) ?? null,
                  }));
                }}
              />
            </Field>
          )}
          <section>
            <h3>{text("mediaVariants")}</h3>
            <p>{text(PROCESSING_TEXT[detail.processing.state])}</p>
            {detail.processing.errorId && (
              <p>
                {text("errorId")}: {detail.processing.errorId}
              </p>
            )}
            {detail.processing.variants.length > 0 && (
              <Table
                columns={[
                  { kind: "text", label: text("columnFormat") },
                  { kind: "title", label: text("mediaDimensions") },
                  { kind: "count", label: text("columnBytes") },
                ]}
              >
                {detail.processing.variants.map((variant) => (
                  <Table.Row key={`${variant.format}-${variant.width}`}>
                    <Table.Cell>{variant.format.toUpperCase()}</Table.Cell>
                    <Table.Cell kind="title">
                      {variant.width} × {variant.height}
                    </Table.Cell>
                    <Table.Cell kind="count">{variant.byteSize} B</Table.Cell>
                  </Table.Row>
                ))}
              </Table>
            )}
          </section>
          <MediaUses uses={detail.uses} />
          {save.isError && <ErrorNotice error={save.error} />}
        </form>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button
              tone="danger"
              icon={<TrashIcon />}
              onClick={() => setDeleting(true)}
              disabled={save.isPending}
            >
              {text("mediaDelete")}
            </Button>
            <Button icon={<XIcon />} onClick={onClose}>
              {text("cancel")}
            </Button>
            <Button
              type="submit"
              form={formId}
              tone="primary"
              icon={<FloppyDiskIcon />}
              disabled={save.isPending}
            >
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
/**
 * One file of the library in a dialog, with its descriptions in the language
 * the dialog's switch has chosen.
 *
 * @param id - The file's id.
 * @param onClose - Closes the dialog.
 */
export function MediaDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { text } = useDashboardLanguage();
  const titleId = useId();
  const detail = useMediaDetail(id);
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
