import { Claim, StateSnapshot } from "./models";

// Topic key: coarse noun used to detect "same question, newer answer".
const TOPICS = ["redis", "postgres", "lru", "cache", "pagination", "cursor", "offset",
  "jwt", "refresh", "oauth", "session", "migration", "webhook", "idempoten", "lock", "uniqueness"];

function topics(text: string): Set<string> {
  const t = text.toLowerCase();
  const out = new Set<string>();
  for (const k of TOPICS) if (t.includes(k)) out.add(k);
  if (!out.size) {
    const w = t.replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(x => x.length > 4).slice(0, 2).join(" ");
    if (w) out.add(w);
  }
  return out;
}
const overlap = (a: Set<string>, b: Set<string>) => [...a].some(x => b.has(x));

const NEG = /won't work|doesn't work|reject|abandon|remov|instead|not viable|revert/i;
const RESOLVE = /pass|fix|resolv|complet|done|shipped|migrat.*complete/i;

/**
 * Temporal resolution: newer conflicting claim supersedes older;
 * passing/fixing evidence resolves blockers. Deterministic; LLM only
 * consulted for ambiguous pairs (resolver_llm flag, not in V1 default).
 */
export function resolveClaims(claims: Claim[]): Claim[] {
  const out = claims.map(c => ({ ...c }));
  // Pairwise supersession among DECISION/CURRENT_STATE on overlapping topics
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (a.status !== "PROPOSED" || b.status !== "PROPOSED") continue;
      if (!["DECISION", "CURRENT_STATE", "REJECTED_DECISION"].includes(a.type)) continue;
      if (!["DECISION", "CURRENT_STATE", "REJECTED_DECISION"].includes(b.type)) continue;
      const same = overlap(topics(a.text), topics(b.text));
      // "instead" = replacement only when the newer claim stays within the older
      // claim's topic space. If it introduces a new topic (e.g. token storage vs
      // token lifetime) it is a complementary refinement, not a supersession.
      const narrows = [...topics(b.text)].every(t => topics(a.text).has(t));
      // removal/descope statement ("removed X", "no X enabled") supersedes earlier adoption of X
      if (same && b.type === "CURRENT_STATE" && /remov|no .*enabled|no longer|revert|stampede/i.test(b.text)
          && (a.type === "DECISION" || a.type === "CURRENT_STATE")) {
        a.status = "SUPERSEDED"; a.valid_until = b.valid_from; a.superseded_by = b.id;
        continue;
      }
      // later failure on same topic supersedes earlier "tests passing" state
      if (same && /fail/i.test(b.text) && /pass/i.test(a.text)) {
        a.status = "SUPERSEDED"; a.valid_until = b.valid_from; a.superseded_by = b.id;
        continue;
      }
      if (same && narrows && /instead|rejected|supersed|switch|replac/i.test(b.text + " " + a.text)) {
        // newer (j) wins if it proposes an alternative
        if (b.type === "DECISION" || b.type === "CURRENT_STATE") {
          a.status = "SUPERSEDED"; a.valid_until = b.valid_from; a.superseded_by = b.id;
        }
      }
      // explicit rejection event supersedes earlier decision on overlapping topics
      if (a.type === "DECISION" && b.type === "REJECTED_DECISION" && overlap(topics(a.text), topics(b.text))) {
        a.status = "SUPERSEDED"; a.valid_until = b.valid_from; a.superseded_by = b.id;
      }
    }
  }
  // Standalone rejections mark matching earlier decisions superseded even across topics via NEG+topic
  // (handled above). Default statuses:
  for (const c of out) {
    if (c.status !== "PROPOSED") continue;
    if (c.type === "REJECTED_DECISION") c.status = "SUPERSEDED";
    else if (c.type === "BLOCKER" && RESOLVE.test(c.text)) c.status = "RESOLVED";
    else c.status = "CURRENT";
    if (c.confidence === "LOW" && c.status === "CURRENT") c.status = "UNCERTAIN";
  }
  // A later CURRENT_STATE mentioning pass/fix resolves earlier blockers on overlapping topics
  const fixes = out.filter(c => c.status === "CURRENT" && RESOLVE.test(c.text));
  for (const b of out.filter(c => c.type === "BLOCKER" && c.status === "CURRENT")) {
    const tb = topics(b.text);
    if (fixes.some(f => overlap(topics(f.text), tb) || /all tests pass|fixed/i.test(f.text))) {
      b.status = "RESOLVED"; b.valid_until = fixes[0].valid_from; b.superseded_by = fixes[0].id;
    }
  }
  void NEG;
  return out;
}

export function snapshot(claims: Claim[]): StateSnapshot {
  const by = (t: string[]) => claims.filter(c => t.includes(c.status));
  const type = (t: string) => claims.filter(c => c.type === t);
  return {
    goal: type("GOAL"),
    current_state: type("CURRENT_STATE"),
    decisions: type("DECISION").filter(c => c.status === "CURRENT"),
    superseded: claims.filter(c => c.status === "SUPERSEDED"),
    resolved: claims.filter(c => c.status === "RESOLVED"),
    blockers: type("BLOCKER").filter(c => c.status === "CURRENT"),
    next_actions: type("NEXT_ACTION").filter(c => c.status !== "SUPERSEDED"),
    files: type("FILE"),
    tests: type("TEST"),
    uncertain: by(["UNCERTAIN", "PROPOSED"]),
  };
}
