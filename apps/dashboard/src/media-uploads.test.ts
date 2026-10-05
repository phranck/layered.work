import { QueryClient } from "@tanstack/react-query";
import type { SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDashboardApi, type DashboardApi } from "./api.js";
import { type UploadProgress, uploadInOrder } from "./media-uploads.js";

const named = (name: string, type: string) => new File(["bytes"], name, { type });

describe("uploading files in order", () => {
  it("hands over each file the library took, in order, and keeps the reason one failed", async () => {
    const refused = new Error("refused");
    const uploadMedia = vi.fn<DashboardApi["uploadMedia"]>(async (file, progress) => {
      progress?.(100);
      if (file.type !== "image/png") throw refused;
      return {
        id: "f6209cc7-086d-4d28-a67e-4d1ad3f750aa",
        slug: file.name.replace(/\.[a-z0-9]+$/, ""),
        url: "/api/media/f6209cc7-086d-4d28-a67e-4d1ad3f750aa/content",
        width: 1,
        height: 1,
        existing: false,
      };
    });
    const api: DashboardApi = { ...createDashboardApi(new QueryClient(), () => {}), uploadMedia };
    let progress: UploadProgress[] = [];
    const setProgress = (next: SetStateAction<UploadProgress[]>) => {
      progress = typeof next === "function" ? next(progress) : next;
    };
    const handed: string[] = [];

    const files = [
      named("first.png", "image/png"),
      named("clip.mp4", "video/mp4"),
      named("second.png", "image/png"),
    ];
    await uploadInOrder(api, files, setProgress, (media) => {
      handed.push(media.slug);
    });

    expect(uploadMedia.mock.calls.map(([file]) => file.name)).toEqual([
      "first.png",
      "clip.mp4",
      "second.png",
    ]);
    expect(handed).toEqual(["first", "second"]);
    expect(progress.map((item) => [item.name, item.percent, item.error])).toEqual([
      ["first.png", 100, undefined],
      ["clip.mp4", 100, refused],
      ["second.png", 100, undefined],
    ]);
  });
});
