import {
  createTopicBody,
  mergeTopicBody,
  saveTopicBody,
  topicIdParam,
  topicList,
  topicListItem,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import { createTopic, deleteTopic, listTopics, mergeTopic, saveTopic } from "../../topics/repository.js";
import { responds } from "../api-metadata.js";
import { requireScope } from "../require-scope.js";
import { principalOf } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The topics an entry can be about, as the dashboard manages them.
 *
 * Every route needs a session. Topics belong to the site, as the entries do, so
 * any signed-in author may change them, and every change is in the audit log.
 */
export const topicsRoutes = new Hono();

topicsRoutes.get("/", requireScope("content:read"), responds(topicList), async (c) =>
  ok(c, await listTopics(database())),
);

// Created from the editor, so it answers with the existing topic for a name that is taken.
topicsRoutes.post(
  "/",
  requireScope("content:write"),
  validate("json", createTopicBody),
  responds(topicListItem),
  async (c) =>
    ok(c, await createTopic(database(), c.req.valid("json"), principalOf(c).userId, principalOf(c).tokenId)),
);

topicsRoutes.put(
  "/:id",
  requireScope("content:write"),
  validate("param", topicIdParam),
  validate("json", saveTopicBody),
  responds(topicListItem),
  async (c) =>
    ok(
      c,
      await saveTopic(
        database(),
        c.req.valid("param").id,
        c.req.valid("json"),
        principalOf(c).userId,
        principalOf(c).tokenId,
      ),
    ),
);

topicsRoutes.post(
  "/:id/merge",
  requireScope("content:write"),
  validate("param", topicIdParam),
  validate("json", mergeTopicBody),
  responds(topicListItem),
  async (c) =>
    ok(
      c,
      await mergeTopic(
        database(),
        c.req.valid("param").id,
        c.req.valid("json").into,
        principalOf(c).userId,
        principalOf(c).tokenId,
      ),
    ),
);

topicsRoutes.delete(
  "/:id",
  requireScope("content:write"),
  validate("param", topicIdParam),
  responds(z.null()),
  async (c) => {
    await deleteTopic(database(), c.req.valid("param").id, principalOf(c).userId, principalOf(c).tokenId);
    return ok(c, null);
  },
);
