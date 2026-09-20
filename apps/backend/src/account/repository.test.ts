import { ErrorCode } from "@layered/schemas";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../http/response.js";
import { updateAccountProfile } from "./repository.js";

const userId = "0199f064-43b7-79a8-917f-eefc8c852497";
const avatarMediaId = "0199f064-43b7-79a8-917f-eefc8c852498";
const current = {
  id: userId,
  email: "editor@example.com",
  displayName: "Editor",
  role: "editor" as const,
  interfaceLanguage: "en" as const,
  avatarMediaId: null,
};
const update = {
  email: "editor@example.com",
  displayName: "Frank",
  interfaceLanguage: "de" as const,
  avatarMediaId,
};

function selection(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
    })),
  };
}

describe("updateAccountProfile", () => {
  it("verifies the selected portrait before updating and audits changed keys without values", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(selection([current]))
      .mockReturnValueOnce(selection([{ id: avatarMediaId }]));
    const returning = vi.fn().mockResolvedValue([{ ...current, ...update }]);
    const updateRows = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })) }));
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const tx = { select, update: updateRows, insert };
    const db = { transaction: vi.fn((work) => work(tx)) };

    await updateAccountProfile(db as never, userId, update);

    expect(select).toHaveBeenCalledTimes(2);
    expect(updateRows).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith({
      actorUserId: userId,
      action: "account.updated",
      subjectType: "users",
      subjectId: userId,
      detail: { changedKeys: ["displayName", "interfaceLanguage", "avatarMediaId"] },
    });
    expect(JSON.stringify(values.mock.calls)).not.toContain("Frank");
    expect(JSON.stringify(values.mock.calls)).not.toContain("editor@example.com");
  });

  it("refuses a portrait that is not an existing allowed raster image before updating", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(selection([current]))
      .mockReturnValueOnce(selection([]));
    const updateRows = vi.fn();
    const tx = { select, update: updateRows, insert: vi.fn() };
    const db = { transaction: vi.fn((work) => work(tx)) };

    const failure = await updateAccountProfile(db as never, userId, update).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpError);
    expect((failure as HttpError).code).toBe(ErrorCode.InvalidRequest);
    expect(updateRows).not.toHaveBeenCalled();
  });
});
