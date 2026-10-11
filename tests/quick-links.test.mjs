import test from "node:test";
import assert from "node:assert/strict";
import { getQuickLinks } from "../src/quickLinks.mjs";

const sites = ["12306", "weather", "kuaidi", "translate", "pinned", "learned", "custom-1"].map((id) => ({ id }));
const prefs = { pinned: [], hidden: [], personalized: true };
const recommendation = { common: [{ id: "learned" }] };
const links = (overrides = {}) => getQuickLinks({ sites, prefs, user: {}, recommendation, ...overrides }).map((site) => site.id);

test("visitors retain valid default entries without using their browsing history", () => {
  assert.deepEqual(links({ user: null, prefs: { ...prefs, pinned: ["pinned"] } }), ["12306", "weather", "kuaidi", "translate"]);
});
test("manual pins come first, recommendations are deduplicated, defaults fill the remaining slots", () => {
  assert.deepEqual(links({ prefs: { ...prefs, pinned: ["custom-1", "learned", "missing"] } }), ["custom-1", "learned", "12306", "weather"]);
});
test("disabling personalization retains manual pins and excludes learned entries", () => {
  assert.deepEqual(links({ prefs: { ...prefs, personalized: false, pinned: ["pinned"] } }), ["pinned", "12306", "weather", "kuaidi"]);
});
test("hidden or removed sites cannot reappear as recommendations or default fillers", () => {
  assert.deepEqual(links({ sites: sites.filter((site) => site.id !== "weather"), prefs: { ...prefs, hidden: ["learned", "12306"] } }), ["kuaidi", "translate"]);
});
