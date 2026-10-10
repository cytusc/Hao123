import test from "node:test";
import assert from "node:assert/strict";
import { mergePreferences } from "../src/preferenceSync.mjs";

const base = {
  pinned: [],
  hidden: [],
  custom: [],
  personalized: true,
  largeText: false,
  showSearch: true,
  engine: "baidu",
};
test("merge preserves both devices, respects hidden sites and an opt-out", () => {
  const cloud = {
    ...base,
    pinned: ["a", "b"],
    hidden: ["c"],
    personalized: false,
  };
  const local = {
    ...base,
    pinned: ["b", "c", "d"],
    hidden: ["a"],
    engine: "bing",
  };
  assert.deepEqual(mergePreferences(cloud, local), {
    ...base,
    pinned: ["b", "d"],
    hidden: ["c", "a"],
    personalized: false,
    engine: "bing",
  });
});
test("custom URL deduplication remaps pins to the retained ID", () => {
  const cloud = {
    ...base,
    custom: [{ id: "custom-a", url: "https://example.com", name: "A" }],
  };
  const local = {
    ...base,
    pinned: ["custom-b"],
    custom: [{ id: "custom-b", url: "https://example.com", name: "B" }],
  };
  const result = mergePreferences(cloud, local);
  assert.deepEqual(result.pinned, ["custom-a"]);
  assert.equal(result.custom.length, 1);
});
test("merge reports limits without silently dropping user data", () => {
  assert.throws(
    () =>
      mergePreferences(
        { ...base, pinned: ["a", "b", "c", "d", "e"] },
        { ...base, pinned: ["f", "g", "h", "i", "j"] },
      ),
    /超出数量上限/,
  );
});
