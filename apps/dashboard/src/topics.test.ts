import type { TopicListItem } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { topicSuggestions } from "./topic-field.js";
import { filterTopics, topicBodyOf, topicLabel } from "./topics.js";

function topic(overrides: Partial<TopicListItem>): TopicListItem {
  return { id: crypto.randomUUID(), en: null, de: null, entryCount: 0, ...overrides };
}

const retro = topic({
  en: { name: "Retro Computing", slug: "retro-computing" },
  de: { name: "Retro-Computer", slug: "retro-computer" },
});
const soldering = topic({ en: { name: "Soldering", slug: "soldering" } });
const topics = [retro, soldering];

describe("a topic's name in one language", () => {
  it("is its own where it has one, and the other language's marked as borrowed where not", () => {
    expect(topicLabel(retro, "de")).toEqual({ name: "Retro-Computer", named: true });
    expect(topicLabel(soldering, "de")).toEqual({ name: "Soldering", named: false });
  });
});

describe("searching the topics", () => {
  it("finds a topic by either name or its address, whatever the case", () => {
    expect(filterTopics(topics, "COMPUTER")).toEqual([retro]);
    expect(filterTopics(topics, "solder")).toEqual([soldering]);
    expect(filterTopics(topics, "  ")).toEqual(topics);
  });
});

describe("what the topic field offers", () => {
  it("offers matching topics not yet chosen, and a new one where no topic has the name", () => {
    const offered = topicSuggestions(topics, [], "comp", "en");
    expect(offered).toEqual([
      { kind: "topic", topic: retro },
      { kind: "create", name: "comp" },
    ]);
  });

  it("leaves out chosen topics, and offers no new one for a name the entry's language already has", () => {
    expect(topicSuggestions(topics, [soldering.id], "soldering", "en")).toEqual([]);
  });

  it("offers a new one for a name only the other language has", () => {
    expect(topicSuggestions(topics, [], "soldering", "de")).toEqual([
      { kind: "topic", topic: soldering },
      { kind: "create", name: "soldering" },
    ]);
  });

  it("offers nothing for an empty field", () => {
    expect(topicSuggestions(topics, [], "   ", "en")).toEqual([]);
  });
});

describe("the topic form", () => {
  const empty = { name: "", slug: "" };

  it("sends an empty language as no name", () => {
    expect(topicBodyOf({ en: { name: " Soldering ", slug: "soldering" }, de: empty })).toEqual({
      value: { en: { name: "Soldering", slug: "soldering" }, de: null },
    });
  });

  it("says what is wrong rather than sending it", () => {
    expect(topicBodyOf({ en: empty, de: empty })).toEqual({ problem: "topicNeedsName" });
    expect(topicBodyOf({ en: { name: "Soldering", slug: "" }, de: empty })).toEqual({
      problem: "topicIncomplete",
    });
    expect(topicBodyOf({ en: { name: "Soldering", slug: "Löten" }, de: empty })).toEqual({
      problem: "topicSlugInvalid",
    });
  });
});
