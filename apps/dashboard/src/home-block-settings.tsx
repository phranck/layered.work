import {
  type BilingualText,
  HOME_BLOCKS,
  type HomeBlockSetting,
  type HomeBlockSettings,
  type HomeBlockType,
  MaxLength,
} from "@layered/schemas";
import { Button, Field, Input, Segmented, Select, Switch } from "@layered/ui";
import { ImagesIcon, XIcon } from "@layered/ui/icons";
import { useState } from "react";
import { optionKey, segmentsFit, settingKey } from "./home-block-labels.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";
import { Translated } from "./translated.js";

/**
 * Every setting a block declares, as a control, drawn from the declaration.
 *
 * There is no screen per block type. A setting added to a declaration in
 * `@layered/schemas` appears here because its kind says which control it gets:
 * a switch for a flag, a segmented control for a choice whose options are each
 * one short word and a dropdown for any other choice, a number field, a text
 * field and a text area in the language the panel's switch shows, and the
 * media picker for a picture. The panel holds `Translated` around them.
 */

/** What every control needs to read and change its value. */
interface ControlProps {
  setting: HomeBlockSetting;
  value: unknown;
  onChange: (value: unknown) => void;
  editable: boolean;
  /** The address of the chosen picture, for the picture control. */
  pictureUrl?: string;
  /** Prefixes each control's id, so two blocks on one screen cannot share one. */
  idPrefix: string;
}

/**
 * The controls of one block's settings.
 *
 * @param type - The block's type, whose declaration decides the controls.
 * @param draft - The values being edited, every declared key present.
 * @param onChange - Replaces one setting's value in the draft.
 * @param editable - Whether the signed-in account may change them.
 * @param pictureUrls - Where each chosen picture can be shown, by setting key.
 */
export function HomeBlockSettingsFields({
  type,
  draft,
  onChange,
  editable,
  pictureUrls,
}: {
  type: HomeBlockType;
  draft: HomeBlockSettings;
  onChange: (key: string, value: unknown) => void;
  editable: boolean;
  pictureUrls: Record<string, string>;
}) {
  return (
    <>
      {HOME_BLOCKS[type].settings.map((setting) => (
        <SettingControl
          key={setting.key}
          setting={setting}
          value={draft[setting.key]}
          onChange={(value) => onChange(setting.key, value)}
          editable={editable}
          pictureUrl={pictureUrls[setting.key]}
          idPrefix={`home-${type}`}
        />
      ))}
    </>
  );
}

/** One setting, as the control its kind calls for. Exported for the test of a kind no control knows. */
export function SettingControl(props: ControlProps) {
  switch (props.setting.kind) {
    case "line":
    case "paragraph":
      return <TextControl {...props} />;
    case "number":
      return <NumberControl {...props} />;
    case "flag":
      return <FlagControl {...props} />;
    case "choice":
      return <ChoiceControl {...props} />;
    case "picture":
      return <PictureControl {...props} />;
    default:
      // A kind this build does not know still shows its value, so a setting
      // that arrived before its control reads as unfinished rather than absent.
      return <FallbackControl {...props} />;
  }
}

/**
 * A text in each of the site's languages, with the fallback offered as the
 * placeholder, showing the language the panel's switch has chosen.
 */
function TextControl({ setting, value, onChange, editable, idPrefix }: ControlProps) {
  const { text } = useDashboardLanguage();
  if (setting.kind !== "line" && setting.kind !== "paragraph") return null;
  return (
    <Translated.Field
      id={`${idPrefix}-${setting.key}`}
      label={text(settingKey(setting.key))}
      hint={text("homeSettingFallback")}
      value={(value ?? { en: "", de: "" }) as BilingualText}
      onChange={onChange}
      placeholder={setting.fallback}
      profile={setting.kind === "paragraph" ? "inline" : undefined}
      maxLength={setting.kind === "paragraph" ? MaxLength.Paragraph : MaxLength.Line}
      disabled={!editable}
    />
  );
}

/** A whole number inside the declared range. */
function NumberControl({ setting, value, onChange, editable, idPrefix }: ControlProps) {
  const { text } = useDashboardLanguage();
  if (setting.kind !== "number") return null;
  const id = `${idPrefix}-${setting.key}`;
  return (
    <Field
      htmlFor={id}
      label={text(settingKey(setting.key))}
      hint={text("listingRange", setting.min, setting.max)}
    >
      <Input
        id={id}
        type="number"
        min={setting.min}
        max={setting.max}
        step={1}
        value={typeof value === "number" && Number.isFinite(value) ? value : ""}
        disabled={!editable}
        onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
      />
    </Field>
  );
}

/** A switch. */
function FlagControl({ setting, value, onChange, editable, idPrefix }: ControlProps) {
  const { text } = useDashboardLanguage();
  const id = `${idPrefix}-${setting.key}`;
  const label = text(settingKey(setting.key));
  return (
    <Field.Inline htmlFor={id} label={label}>
      <Switch
        id={id}
        aria-label={label}
        checked={value === true}
        disabled={!editable}
        onCheckedChange={onChange}
      />
    </Field.Inline>
  );
}

/** One of a closed set, side by side where every option is one short word, in a dropdown otherwise. */
function ChoiceControl({ setting, value, onChange, editable, idPrefix }: ControlProps) {
  const { text } = useDashboardLanguage();
  if (setting.kind !== "choice") return null;
  const id = `${idPrefix}-${setting.key}`;
  const label = text(settingKey(setting.key));
  const options = setting.options.map((option) => ({
    value: option,
    label: text(optionKey(setting.key, option)),
    disabled: !editable,
  }));
  return segmentsFit(options.map((option) => option.label)) ? (
    <Field label={label}>
      <Segmented aria-label={label} value={String(value)} options={options} onValueChange={onChange} />
    </Field>
  ) : (
    <Field htmlFor={id} label={label}>
      <Select
        id={id}
        value={String(value)}
        options={options}
        disabled={!editable}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** A picture from the library, or none. */
function PictureControl({ setting, value, onChange, editable, pictureUrl }: ControlProps) {
  const { text } = useDashboardLanguage();
  const [picking, setPicking] = useState(false);
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);
  const url = chosenUrl ?? pictureUrl;
  return (
    <Field label={text(settingKey(setting.key))} hint={text("homeSettingPictureHint")}>
      <div className="media-field">
        {typeof value === "string" && url ? (
          <img src={url} alt="" />
        ) : (
          <span className="media-field__name">{text("homeSettingPictureNone")}</span>
        )}
        <span className="actions media-field__actions">
          {typeof value === "string" && (
            <Button disabled={!editable} icon={<XIcon />} onClick={() => onChange(null)}>
              {text("remove")}
            </Button>
          )}
          <Button disabled={!editable} icon={<ImagesIcon />} onClick={() => setPicking(true)}>
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

/** A text field holding whatever the value is, for a kind no other control knows. */
function FallbackControl({ setting, value, onChange, editable, idPrefix }: ControlProps) {
  const { text } = useDashboardLanguage();
  const id = `${idPrefix}-${setting.key}`;
  return (
    <Field htmlFor={id} label={text(settingKey(setting.key))}>
      <Input
        id={id}
        value={value === null || value === undefined ? "" : String(value)}
        maxLength={MaxLength.Line}
        disabled={!editable}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
