import type { SitePictureSetting } from "@layered/schemas";

/**
 * What the API says about each site setting that names a library picture.
 *
 * One entry per setting, so a picture setting added to `SITE_PICTURE_SETTINGS`
 * fails the type check here until it says both things.
 *
 * @property use - How a file's list of uses names this setting.
 * @property refusal - What a save is told when the setting names no raster image uploaded here.
 */
export const SITE_PICTURES: Record<SitePictureSetting, { use: string; refusal: string }> = {
  socialImageMediaId: {
    use: "Site sharing image",
    refusal: "Choose a raster image uploaded to the library for the sharing picture.",
  },
  watermarkMediaId: {
    use: "Site watermark",
    refusal: "Choose a raster image uploaded to the library for the watermark.",
  },
};
