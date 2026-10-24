import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseScript,
  parseStoryboard,
  planEpisode,
  estimateDuration,
} from "../public/planner.mjs";
test("preserves dialogue, including colons and punctuation", () => {
  const [s] = parseScript("Alex: Here is the time: 10:30. “Ready?”", [
    { name: "Alex" },
  ]);
  assert.equal(s.dialogue, "Here is the time: 10:30. “Ready?”");
  assert.equal(s.speaker, "Alex");
});
test("scene headers and bracket notes are not spoken", () => {
  const shots = parseScript(
    "INT. NEWSROOM — MORNING\n[Sam looks at Alex.]\nSam: Hello.\nEXT. PARK — DAY\nAlex: Goodbye.",
  );
  assert.equal(shots.length, 2);
  assert.equal(shots[0].scene, "INT. NEWSROOM — MORNING");
  assert.equal(shots[0].action, "Sam looks at Alex.");
  assert.equal(shots[1].scene, "EXT. PARK — DAY");
  assert.equal(shots[1].action, "");
});
test("direction labels do not become characters", () => {
  const shots = parseScript("Camera: Wide shot.\nAlex: Welcome.");
  assert.equal(shots.length, 1);
  assert.equal(shots[0].speaker, "Alex");
  assert.match(shots[0].action, /Wide/);
});
test("maps storyboard panels in order without replacing dialogue", () => {
  const p = {
    characters: [],
    script: "A: One.\nB: Two.",
    storyboard: "Panel 1: Wide.\nPanel 2: Close.",
    style: "gentle",
  };
  const shots = planEpisode(p);
  assert.equal(shots[0].dialogue, "One.");
  assert.equal(shots[1].dialogue, "Two.");
  assert.equal(shots[1].action, "Close.");
  assert.equal(shots[0].camera, "wide");
  assert.equal(estimateDuration(shots), 9.5);
});
test("blank input yields no accidental shots", () => {
  assert.deepEqual(parseScript(" \n\n"), []);
  assert.deepEqual(parseStoryboard(""), []);
});
