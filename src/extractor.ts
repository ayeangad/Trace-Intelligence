import { TraceEvent, Claim, ClaimType, Confidence } from "./models";

let n = 0;
const nid = (p: string) => `${p}_${++n}`;
export function resetIds() { n = 0; }

const REJECT = /won't work|doesn't work|reject|abandon|instead|another .*dependenc|not viable|failed approach/i;
const REMOVED = /\bremov(ed|e|al)?\b|delet|disabl|no .* (enabled|active)|no longer|revert/i;
const DECIDE = /decid|let'?s [a-z]+|we('ll| will) use|choose|chose|going with|selected|use .*instead/i;
const SPECULATE = /maybe|might|could work|perhaps|^consider\?|what if/i;
const BLOCKER = /block|fail|error|missing|duplicate|issue|bug|unique|broken|times out|time ?out|spike|stampe|not yet/i;
const NEXT = /next step|next action|todo|need to|should now|remaining/i;
const GOAL = /need to add|goal is|implement|we need/i;
const NOSTATE = /no .* (enabled|active)|removed|no longer|currently enabled/i;
const PASS = /pass/i;
const FAIL = /fail/i;

function conf(text: string, explicit: boolean): Confidence {
  if (SPECULATE.test(text)) return "LOW";
  return explicit ? "HIGH" : "MEDIUM";
}

/**
 * Deterministic claim extractor (zero tokens). LLM path (`--llm on`) only
 * refines text/confidence; it never invents spans — see prompts.ts.
 */
export function extractClaims(events: TraceEvent[]): Claim[] {
  resetIds();
  const claims: Claim[] = [];
  const seenFiles = new Set<string>();
  const seenTests = new Set<string>();

  for (const e of events) {
    const t = e.text;
    if (!t) continue;

    if (e.type === "tool_call" || e.type === "file_change") {
      const p = e.path ?? (t.match(/[\w\-./]+\.(py|ts|tsx|js|go|sql)/)?.[0]);
      if (p && !seenFiles.has(p)) {
        seenFiles.add(p);
        claims.push(mk("FILE", p, e, "HIGH"));
      }
      continue;
    }
    if (e.type === "test" || /pytest|npm test|vitest|go test/.test(t)) {
      const key = e.command ?? t.slice(0, 80);
      if (!seenTests.has(key)) {
        seenTests.add(key);
        claims.push(mk("TEST", key, e, "HIGH"));
      }
      // fall through: results below also classify pass/fail as state
    }
    if (e.type === "tool_result" || e.type === "error") {
      if (FAIL.test(t)) claims.push(mk("BLOCKER", t.slice(0, 200), e, "HIGH"));
      else if (PASS.test(t)) claims.push(mk("CURRENT_STATE", `Tests passing: ${t.slice(0, 120)}`, e, "MEDIUM"));
      else if (BLOCKER.test(t)) claims.push(mk("BLOCKER", t.slice(0, 200), e, "MEDIUM"));
      continue;
    }
    // messages / decisions (order matters: speculation guard first)
    const speculative = SPECULATE.test(t);
    if (NEXT.test(t) && !speculative) {
      claims.push(mk("NEXT_ACTION", t.slice(0, 220), e, conf(t, true)));
      // "We need to X" states the objective as well as an action — keep both.
      if (/we need to|goal is/i.test(t)) claims.push(mk("GOAL", t.slice(0, 220), e, "MEDIUM"));
    }
    else if (speculative) claims.push(mk("DECISION", t.slice(0, 220), e, "LOW"));
    else if (REMOVED.test(t)) claims.push(mk("CURRENT_STATE", t.slice(0, 220), e, conf(t, true)));
    else if (REJECT.test(t) && DECIDE.test(t)) {
      // Mixed multi-sentence message ("X won't work... decided Y") carries two facts.
      // Single-sentence "Let's use X instead" stays one DECISION (resolver links it to prior).
      const parts = t.split(/\. +/).map(s => s.trim()).filter(Boolean);
      const rej = parts.filter(s => REJECT.test(s) && !DECIDE.test(s)).join(". ").slice(0, 220);
      const dec = parts.filter(s => DECIDE.test(s)).join(". ").slice(0, 220);
      if (parts.length >= 2 && rej && dec) {
        claims.push(mk("REJECTED_DECISION", rej, e, conf(t, true)));
        claims.push(mk("DECISION", dec, e, conf(t, true)));
      } else {
        claims.push(mk("DECISION", t.slice(0, 220), e, conf(t, true)));
      }
    }
    else if (REJECT.test(t)) claims.push(mk("REJECTED_DECISION", t.slice(0, 220), e, conf(t, true)));
    else if (DECIDE.test(t)) claims.push(mk("DECISION", t.slice(0, 220), e, conf(t, true)));
    else if (BLOCKER.test(t)) claims.push(mk("BLOCKER", t.slice(0, 220), e, conf(t, false)));
    else if (NOSTATE.test(t)) claims.push(mk("CURRENT_STATE", t.slice(0, 220), e, conf(t, false)));
    else if (GOAL.test(t) && claims.filter(c => c.type === "GOAL").length === 0)
      claims.push(mk("GOAL", t.slice(0, 220), e, "MEDIUM"));
  }
  return claims;
}

function mk(type: ClaimType, text: string, e: TraceEvent, c: Confidence): Claim {
  return {
    id: `c_${String(++n).padStart(3, "0")}`, type, text,
    status: "PROPOSED", timestamp: e.time, confidence: c,
    source_spans: [e.id], valid_from: e.time, valid_until: null, superseded_by: null,
  };
}
