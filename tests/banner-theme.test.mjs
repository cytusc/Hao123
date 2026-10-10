import assert from "node:assert/strict";
import test from "node:test";
import { getBannerTheme } from "../src/bannerTheme.mjs";

const localDate = (month, hour, minute = 0) => new Date(2026, month - 1, 1, hour, minute);

test("all twelve local months map to the four calendar seasons", () => {
  const expected = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
  expected.forEach((season, index) => assert.equal(getBannerTheme(localDate(index + 1, 12)).season, season));
});

test("time boundaries include both sides of midnight", () => {
  const cases = [[0,0,"night"],[4,59,"night"],[5,0,"morning"],[10,59,"morning"],[11,0,"day"],[16,59,"day"],[17,0,"evening"],[21,59,"evening"],[22,0,"night"],[23,59,"night"]];
  for (const [hour, minute, period] of cases) assert.equal(getBannerTheme(localDate(10, hour, minute)).period, period);
});

test("all sixteen combinations resolve and greetings follow the same clock", () => {
  const scenes = new Set();
  for (const month of [3,6,9,12]) for (const hour of [8,12,19,23]) {
    const theme = getBannerTheme(localDate(month, hour));
    scenes.add(`${theme.season}-${theme.period}`);
    assert.equal(theme.greeting, { 8:"早上好",12:"中午好",19:"晚上好",23:"夜深了" }[hour]);
  }
  assert.equal(scenes.size, 16);
  assert.equal(getBannerTheme(localDate(10,14)).greeting, "下午好");
});

test("calendar rollover updates season independently of night period", () => {
  const before = new Date(2026, 10, 30, 23, 59);
  const after = new Date(2026, 11, 1, 0, 0);
  assert.equal(getBannerTheme(before).season, "autumn");
  assert.deepEqual(getBannerTheme(after), { season:"winter", period:"night", greeting:"夜深了" });
});
