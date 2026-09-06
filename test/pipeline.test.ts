import { test, describe } from "node:test";
import assert from "node:assert";
import { parseJsonl } from "../src/parser";
import { extractClaims } from "../src/extractor";
import { resolveClaims, snapshot } from "../src/resolver";
import { readFileSync } from "fs";

const GOLDEN = readFileSync("examples/trace.jsonl", "utf8");

describe("parser", () => {
  test("golden fixture parses to 10 ordered events", () => {
    const evs = parseJsonl(GOLDEN, "trace");
    assert.equal(evs.length, 10);
    assert.equal(evs[0].id, "e001");
    assert.ok(evs.every(e => e.session === "trace"));
  });
});

describe("extractor", () => {
  test("extracts decision, rejection, blocker, next action with spans", () => {
    const claims = extractClaims(parseJsonl(GOLDEN));
    const types = claims.map(c => c.type);
    for (const t of ["DECISION", "REJECTED_DECISION", "BLOCKER", "NEXT_ACTION", "FILE"] as const)
      assert.ok(types.includes(t), `missing ${t}`);
    assert.ok(claims.every(c => c.source_spans.length > 0), "100% provenance");
  });
  test("speculation is quarantined as LOW confidence", () => {
    const claims = extractClaims(parseJsonl(
      `{"id":"e1","time":"10:00","type":"message","text":"Maybe Redis would work."}`));
    assert.equal(claims[0].confidence, "LOW");
  });
});

describe("resolver", () => {
  test("postgres current, redis superseded, blocker current", () => {
    const resolved = resolveClaims(extractClaims(parseJsonl(GOLDEN)));
    const snap = snapshot(resolved);
    assert.ok(snap.decisions.some(c => /postgres/i.test(c.text)), "postgres current");
    assert.ok(snap.superseded.some(c => /redis/i.test(c.text)), "redis superseded");
    assert.ok(snap.blockers.some(c => /unique/i.test(c.text)), "blocker current");
    assert.ok(snap.next_actions.some(c => /uniqueness constraint/i.test(c.text)));
  });
});
