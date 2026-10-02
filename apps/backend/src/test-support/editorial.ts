import { hashPassword } from "@layered/passwords";
import { SESSION_COOKIE } from "../auth/cookie.js";
import {
  entries,
  entryTopics,
  entryTranslations,
  media,
  mediaTranslations,
  topics,
  topicTranslations,
  users,
} from "../db/schema/index.js";
import { app } from "../http/app.js";
import { emptyTestDatabase, testDatabase } from "./database.js";

/**
 * A small editorial library for the tests that read one: an account to sign in
 * with, three entries in two kinds, two files and two topics.
 *
 * Every value a test asserts on is written here, so a test reads as what it
 * expects of this library rather than as how the library was built.
 *
 * - A post in English and German. The English one is public with a picture, the
 *   German one hidden with a document as its picture. Its topic is named
 *   "Retro Computing" in English and "Retro-Computer" in German.
 * - A draft post in English only, about "Soldering", a topic named in English
 *   only.
 * - A public page.
 * - A PNG whose English alt text is "A soldering iron on the bench", and a PDF.
 */

/** The account the library's tests sign in as. */
export const EDITOR = { email: "editor@layered.test", password: "a-password-for-the-library" };

/** Empties the database and writes the library. */
export async function seedEditorialLibrary(): Promise<void> {
  const database = await testDatabase();
  await emptyTestDatabase();
  await database.insert(users).values({
    email: EDITOR.email,
    passwordHash: await hashPassword(EDITOR.password),
    displayName: "Editor",
    role: "editor",
  });

  const [picture, document] = await database
    .insert(media)
    .values([
      {
        slug: "soldering-iron",
        kind: "image",
        mimeType: "image/png",
        storageKey: "uploads/soldering-iron",
        byteSize: 10,
        checksum: "a".repeat(64),
        width: 40,
        height: 30,
      },
      {
        slug: "schematic-sheet",
        kind: "document",
        mimeType: "application/pdf",
        storageKey: "uploads/schematic-sheet",
        byteSize: 10,
        checksum: "b".repeat(64),
      },
    ])
    .returning({ id: media.id });
  await database
    .insert(mediaTranslations)
    .values({ mediaId: picture?.id ?? "", language: "en", altText: "A soldering iron on the bench" });

  const created = new Date("2026-01-01T00:00:00Z");
  const [pair, single, page] = await database
    .insert(entries)
    .values([
      { kind: "post", createdAt: created },
      { kind: "post", createdAt: created },
      { kind: "page", createdAt: created },
    ])
    .returning({ id: entries.id });

  await database.insert(entryTranslations).values([
    {
      entryId: pair?.id ?? "",
      language: "en",
      title: "Published in English",
      state: "public",
      publishedAt: new Date("2025-05-01T00:00:00Z"),
      featuredMediaId: picture?.id,
    },
    {
      entryId: pair?.id ?? "",
      language: "de",
      title: "Auf Deutsch versteckt",
      state: "hidden",
      publishedAt: new Date("2025-06-01T00:00:00Z"),
      featuredMediaId: document?.id,
    },
    { entryId: single?.id ?? "", language: "en", title: "A draft", state: "draft" },
    {
      entryId: page?.id ?? "",
      language: "en",
      title: "A page",
      state: "public",
      publishedAt: new Date("2024-01-01T00:00:00Z"),
    },
  ]);

  const [retro, soldering] = await database.insert(topics).values([{}, {}]).returning({ id: topics.id });
  await database.insert(topicTranslations).values([
    { topicId: retro?.id ?? "", language: "en", name: "Retro Computing", slug: "retro-computing" },
    { topicId: retro?.id ?? "", language: "de", name: "Retro-Computer", slug: "retro-computer" },
    { topicId: soldering?.id ?? "", language: "en", name: "Soldering", slug: "soldering" },
  ]);
  await database.insert(entryTopics).values([
    { entryId: pair?.id ?? "", topicId: retro?.id ?? "" },
    { entryId: single?.id ?? "", topicId: soldering?.id ?? "" },
  ]);
}

/** Signs the library's account in and returns the cookie to send back. */
export async function editorCookie(): Promise<string> {
  const response = await app.request("/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(EDITOR),
  });
  const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  return setCookie?.split(";")[0] ?? "";
}
