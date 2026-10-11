import {
  type ContentLanguage,
  MaxLength,
  type MediaDetail,
  unsplashCreditLine,
  WATERMARK_ANCHORS,
} from "@layered/schemas";
import { Card, Field, FieldHint, Input, MediaCredit, Select, Switch } from "@layered/ui";
import { useId, useState } from "react";
import { ActionButton } from "./action-button.js";
import { FocalPointEditor } from "./focal-point.js";
import { fileSize } from "./format.js";
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
import { CardDialog, DialogForm } from "./modal.js";
import { QueryStates } from "./query-states.js";
import { Table } from "./table.js";
import { useTextLanguage } from "./text-language.js";
import { Timestamp } from "./timestamp.js";
import { Translated } from "./translated.js";

/** The value the select uses for a picture without a watermark, since a select value cannot be null. */
const NO_WATERMARK = "";

/**
 * A file's descriptions, focal point and watermark, with what the library
 * knows about it: its size, its variants and where it is used.
 *
 * @param titleId - The id of the dialog's title, which the dialog is named by.
 * @param detail - The file as the API returned it.
 * @param onClose - Closes the dialog, after a save as well.
 */
function MediaMetadataEditor({
  titleId,
  detail,
  onClose,
}: {
  titleId: string;
  detail: MediaDetail;
  onClose: () => void;
}) {
  const { text, language: interfaceLanguage } = useDashboardLanguage();
  const [value, setValue] = useState(() => metadataDraftOf(detail));
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
      <DialogForm
        titleId={titleId}
        title={detail.slug}
        headerActions={<Translated.Switch />}
        onSubmit={() => save.mutate(value)}
        onClose={onClose}
        busy={save.isPending}
        error={save.error}
        destructive={
          <ActionButton action="delete" onClick={() => setDeleting(true)} disabled={save.isPending}>
            {text("mediaDelete")}
          </ActionButton>
        }
      >
        <FieldHint as="p">
          {detail.mimeType} · {fileSize(interfaceLanguage, detail.byteSize)} ·{" "}
          <Timestamp at={detail.uploadedAt} />
        </FieldHint>
        {detail.width && detail.height && (
          <FieldHint as="p">
            {text("mediaDimensions")}: {detail.width} × {detail.height}
          </FieldHint>
        )}
        {detail.credit && (
          <FieldHint as="p">
            <MediaCredit.Text credit={unsplashCreditLine(detail.credit, interfaceLanguage)} />
          </FieldHint>
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
        <Field label={text("mediaVariants")}>
          <FieldHint as="p">{text(PROCESSING_TEXT[detail.processing.state])}</FieldHint>
          {detail.processing.errorId && (
            <FieldHint as="p">
              {text("errorId")}: {detail.processing.errorId}
            </FieldHint>
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
                  <Table.Cell kind="count">{fileSize(interfaceLanguage, variant.byteSize)}</Table.Cell>
                </Table.Row>
              ))}
            </Table>
          )}
        </Field>
        <MediaUses uses={detail.uses} />
      </DialogForm>
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
        {detail.data ? (
          <MediaMetadataEditor key={id} titleId={titleId} detail={detail.data} onClose={onClose} />
        ) : (
          <>
            <Card.Header id={titleId} title={text("mediaDetails")} />
            <QueryStates query={detail}>{() => null}</QueryStates>
          </>
        )}
      </CardDialog>
    </Translated>
  );
}
