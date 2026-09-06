import { TraceEvent, Claim, StateSnapshot } from "./models";

const line = "─".repeat(46);

export function renderStatus(name: string, s: StateSnapshot, claims: Claim[]): string {
  const sec = (t: string, items: string[]) =>
    items.length ? `${t}\n${items.map(i => `  ${i}`).join("\n")}\n` : "";
  const cur = claims.filter(c => c.status === "CURRENT").length;
  const sup = claims.filter(c => c.status === "SUPERSEDED").length;
  const prov = claims.length ? Math.round(100 * claims.filter(c => c.source_spans.length > 0).length / claims.length) : 100;
  return [
    "╭" + "─".repeat(44) + "╮",
    "│ TRACE INTELLIGENCE" + " ".repeat(44 - 21) + "│",
    `│ ${name.slice(0, 40).padEnd(40)} │`,
    "╰" + "─".repeat(44) + "╯", "",
    sec("GOAL", s.goal.map(c => c.text)),
    sec("CURRENT STATE", [...s.current_state.map(c => c.text),
      ...s.decisions.map(c => `✓ ${c.text}`)].slice(0, 6) || ["(none)"]),
    sec("NEXT ACTION", s.next_actions.slice(0, 3).map(c => c.text)),
    sec("BLOCKERS", s.blockers.map(c => `• ${c.text}`)),
    sec("CURRENT DECISIONS", s.decisions.map(c => `✓ ${c.text}`)),
    sec("SUPERSEDED", s.superseded.map(c => `✗ ${c.text}`)),
    sec("FILES", s.files.map(c => `• ${c.text}`)),
    sec("TESTS", s.tests.map(c => `• ${c.text}`)),
    "EVIDENCE",
    `  ${cur} current claims`,
    `  ${sup} superseded claims`,
    `  ${prov}% provenance coverage`,
  ].filter(Boolean).join("\n");
}

export function renderHandoff(name: string, s: StateSnapshot, ev: Map<string, TraceEvent>): string {
  const evLines: string[] = [];
  for (const c of [...s.decisions, ...s.blockers, ...s.next_actions].slice(0, 12))
    for (const id of c.source_spans) {
      const e = ev.get(id);
      if (e) evLines.push(`- \`${id}\` — ${e.text.slice(0, 100)}`);
    }
  return [`# Work Handoff — ${name}`, "",
    "## Goal", ...(s.goal.map(c => c.text) || ["(unknown)"]), "",
    "## Current State",
    ...s.current_state.map(c => c.text),
    ...s.decisions.map(c => `- ${c.text} (current)`), "",
    "## Current Blocker",
    ...(s.blockers.map(c => `- ${c.text}`) || ["(none recorded)"]), "",
    "## Next Action",
    ...(s.next_actions.slice(0, 3).map(c => `- ${c.text}`) || ["(unknown)"]), "",
    "## Current Decisions", ...s.decisions.map(c => `- ${c.text}`), "",
    "## Superseded Decisions", ...s.superseded.map(c => `- ${c.text}`), "",
    "## Relevant Files", ...s.files.map(c => `- \`${c.text}\``), "",
    "## Tests", ...s.tests.map(c => `- \`${c.text}\``), "",
    "## Evidence", ...evLines,
  ].join("\n");
}

export function renderPrompt(name: string, s: StateSnapshot): string {
  return [`You are continuing an existing software task (${name}).`,
    ``, `GOAL: ${s.goal.map(c => c.text).join(" ") || "(unknown)"}`,
    `CURRENT STATE: ${[...s.current_state.map(c => c.text), ...s.decisions.map(c => c.text)].join(" ") || "(unknown)"}`,
    `BLOCKER: ${s.blockers.map(c => c.text).join(" ") || "(none recorded)"}`,
    `NEXT ACTION: ${s.next_actions.slice(0, 2).map(c => c.text).join(" ") || "(unknown)"}`,
    `CURRENT DECISIONS: ${s.decisions.map(c => c.text).join("; ") || "(none)"}`,
    `SUPERSEDED (do NOT re-do): ${s.superseded.map(c => c.text).join("; ") || "(none)"}`,
    `FILES: ${s.files.map(c => c.text).join(", ")}`,
    `RULE: treat superseded items as rejected. Cite evidence ids when acting.`, line,
  ].join("\n");
}

/** Very small keyword explainer over resolved state (no LLM needed). */
const STOP = new Set(("what,why,how,which,who,when,where,is,are,was,were,the,a,an,of,for,to,in,on,by,with,do,does,did,that,this,should,there,current,currently,used,using,need,needs,kind".split(",")));
export function explain(query: string, claims: Claim[], ev: Map<string, TraceEvent>): string {
  const q = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
  const scored = claims.map(c => {
    const t = c.text.toLowerCase();
    let score = q.filter(w => t.includes(w)).length;
    // question-focus boost: blocker/file/test/next questions prefer matching types
    if (/blocker|block|failing|fail|issue|bug/.test(query.toLowerCase()) && c.type === "BLOCKER") score += 1;
    if (/file|modif|change|touch/.test(query.toLowerCase()) && c.type === "FILE") score += 2;
    if (/test/.test(query.toLowerCase()) && (c.type === "TEST" || c.type === "BLOCKER")) score += 1;
    if (/next|action|step/.test(query.toLowerCase()) && c.type === "NEXT_ACTION") score += 2;
    if (/why|reject/.test(query.toLowerCase()) && c.type === "REJECTED_DECISION") score += 2;
    // cause lives in failure events: "why was X removed/rejected" needs the BLOCKER too
    if (/\bwhy\b/.test(query.toLowerCase()) && /(removed|rejected)/.test(query.toLowerCase()) && c.type === "BLOCKER") score += 2;
    if (/\b(previous|before|superseded)\b/.test(query.toLowerCase()) && c.status === "SUPERSEDED") score += 1;
    if (/supersed/.test(query.toLowerCase()) && c.status === "SUPERSEDED") score += 2;
    // status/type priority: grounded current answers outrank goals and speculation
    if (c.status === "UNCERTAIN" || c.status === "PROPOSED") score -= 3;
    if (c.type === "GOAL") score -= 2;
    if (["DECISION", "CURRENT_STATE", "BLOCKER", "NEXT_ACTION", "REJECTED_DECISION"].includes(c.type) && c.status !== "UNCERTAIN") score += 1;
    if (/what .* (currently|used|approach|enabled|happening)|which .* current/.test(query.toLowerCase())
        && (c.type === "DECISION" || c.type === "CURRENT_STATE") && c.status === "CURRENT") score += 2;
    return { c, score };
  // tie-break: later evidence wins (recency = freshness)
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || (a.c.timestamp < b.c.timestamp ? 1 : -1)).slice(0, 3);
  if (!scored.length) return `No grounded claim matches "${query}". Status: UNCERTAIN — no evidence.`;
  // Report ALL top matches, not just the first: blockers/files/decisions compose the answer.
  const bodies = scored.map(({ c }) => {
    const quotes = c.source_spans.map(id => {
      const e = ev.get(id);
      return e ? `[${id}] ${e.time} "${e.text.slice(0, 160)}"` : `[${id}] (missing)`;
    });
    const alt = claims.find(x => x.id === c.superseded_by);
    return [`${c.text} [${c.status}]`,
      ...(alt ? [`  (supersedes: ${alt.text.slice(0, 80)} → ${alt.status})`] : []),
      ...quotes].join("\n");
  });
  const top = scored[0].c;
  const altTop = claims.find(x => x.id === top.superseded_by);
  return [...bodies,
    ``, `Status:`, `  ${top.text.slice(0, 60)} → ${top.status}`,
    ...(altTop ? [`  alternative: ${altTop.text} → ${altTop.status}`] : []),
  ].join("\n");
}

/** Semantic changelog grouped by claim type since a session/time cutoff. */
export function changes(since: string, claims: Claim[], events: TraceEvent[]): string {
  const after = events.some(e => e.session === since)
    ? events.filter(e => (e.session ?? "") >= since)
    : events;
  const ids = new Set(after.map(e => e.id));
  const rel = claims.filter(c => c.source_spans.some(s => ids.has(s)));
  const g = (t: string) => rel.filter(c => c.type === t);
  const fmt = (prefix: string, cs: Claim[]) => cs.map(c =>
    `${c.status === "SUPERSEDED" ? "-" : c.status === "CURRENT" ? "+" : "!"} ${c.text} [${c.status}]`);
  return ["WORK CHANGES", line, "",
    "ARCHITECTURE", ...fmt("+", g("DECISION")), ...fmt("-", g("REJECTED_DECISION")), "",
    "IMPLEMENTATION", ...fmt("+", g("FILE")), ...fmt("+", g("CURRENT_STATE")), "",
    "TESTS", ...fmt("!", g("TEST")), ...fmt("!", g("BLOCKER")), "",
    "NEXT", ...g("NEXT_ACTION").map(c => `→ ${c.text}`),
  ].join("\n");
}
