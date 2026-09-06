import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { loadTraces } from "../src/parser";
import { extractClaims } from "../src/extractor";
import { resolveClaims } from "../src/resolver";
import { explain, changes } from "../src/handoff";

interface Q { task: string; q: string; expect: string[]; stale: string[]; temporal: boolean; }
const approxTokens = (s: string) => Math.ceil(s.length / 4);

/** Arm A: raw keyword retrieval — top-3 events by keyword overlap, joined. */
function armRaw(question: string, taskDir: string): { answer: string; tokens: number } {
  const events = loadTraces(taskDir);
  const keys = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const scored = events.map(e => ({
    e, s: keys.filter(k => e.text.toLowerCase().includes(k)).length,
  })).sort((a, b) => b.s - a.s);
  // naive failure mode: ties broken by earliest = stale-prone
  const top = scored.slice(0, 3).map(x => x.e.text).join(" ");
  return { answer: top || "(no match)", tokens: approxTokens(top) + approxTokens(question) };
}

/** Arm B: naive summary — first + last event compressed, then keyword match. */
function armSummary(question: string, taskDir: string): { answer: string; tokens: number } {
  const events = loadTraces(taskDir);
  const summary = `Work involved: ${events.slice(0, 2).map(e => e.text).join(" ")} Later: ${events.slice(-2).map(e => e.text).join(" ")}`;
  return { answer: summary, tokens: approxTokens(summary) + approxTokens(question) };
}

/** Arm C: trace intelligence — resolved claims + provenance. */
function armTI(question: string, taskDir: string): { answer: string; tokens: number; prov: number } {
  const ablate = process.env.ABLATE ?? "full"; // full | no-resolve | top1
  const events = loadTraces(taskDir);
  let resolved = resolveClaims(extractClaims(events));
  if (ablate === "no-resolve")
    resolved = resolved.map(c => ({ ...c, status: "CURRENT" as const, superseded_by: null }));
  const ev = new Map(events.map(e => [e.id, e]));
  // "what changed" questions use the dedicated changes command, like a real user would
  let answer = /changed|since/.test(question.toLowerCase())
    ? changes("session_02", resolved, events) + "\n" + explain(question, resolved, ev)
    : explain(question, resolved, ev);
  if (ablate === "top1") answer = answer.split("\n").slice(0, 5).join("\n");
  const prov = resolved.length ? resolved.filter(c => c.source_spans.length > 0).length / resolved.length : 1;
  return { answer, tokens: approxTokens(answer) + approxTokens(question), prov };
}

function grade(answer: string, q: Q): { correct: boolean; stale: boolean } {
  const a = answer.toLowerCase();
  const correct = q.expect.some(e => a.includes(e.toLowerCase()));
  // stale = mentions the superseded term WITHOUT the current term, on temporal Qs
  const mentionsStale = q.stale.some(s => a.includes(s.toLowerCase()));
  const mentionsCurrent = q.expect.some(e => a.includes(e.toLowerCase()));
  const stale = q.temporal && mentionsStale && !mentionsCurrent;
  return { correct, stale };
}

const questions: Q[] = JSON.parse(readFileSync("eval/questions.json", "utf8"));
const rows: string[] = ["task,question,arm,correct,stale,provenance,tokens"];
const agg: Record<string, { n: number; ok: number; stale: number; tok: number; prov: number }> = {};

for (const q of questions) {
  const dir = join("corpus/tasks", q.task);
  const arms = { raw: armRaw(q.q, dir), summary: armSummary(q.q, dir), trace_intel: armTI(q.q, dir) };
  for (const [arm, r] of Object.entries(arms)) {
    const g = grade(r.answer, q);
    const prov = arm === "trace_intel" ? (r as any).prov.toFixed(3) : "";
    rows.push(`"${q.task}","${q.q.replace(/"/g, "'")}","${arm}",${g.correct},${g.stale},${prov},${r.tokens}`);
    const k = arm;
    agg[k] ??= { n: 0, ok: 0, stale: 0, tok: 0, prov: 0 };
    agg[k].n++; if (g.correct) agg[k].ok++; if (g.stale) agg[k].stale++;
    agg[k].tok += r.tokens; if ((r as any).prov) agg[k].prov += (r as any).prov;
  }
}
void readdirSync;
mkdirSync("results", { recursive: true });
writeFileSync("results/results.csv", rows.join("\n"));

console.log("\nTRACE INTELLIGENCE BENCHMARK");
console.log("=".repeat(70));
console.log(`Tasks: 5  Questions: ${questions.length}  Temporal: ${questions.filter(q => q.temporal).length}`);
console.log("-".repeat(70));
console.log(`arm           accuracy   stale-rate   avg-tokens   provenance`);
for (const [arm, a] of Object.entries(agg)) {
  const acc = (100 * a.ok / a.n).toFixed(1).padStart(6);
  const st = (100 * a.stale / a.n).toFixed(1).padStart(6);
  const tok = String(Math.round(a.tok / a.n)).padStart(8);
  const pv = arm === "trace_intel" ? (100 * a.prov / a.n).toFixed(1) + "%" : "n/a";
  console.log(`${arm.padEnd(13)} ${acc}%    ${st}%      ${tok}      ${pv}`);
}
console.log("-".repeat(70));
// temporal subset accuracy
for (const arm of ["raw", "summary", "trace_intel"]) {
  let n = 0, ok = 0;
  for (const q of questions) {
    const dir = join("corpus/tasks", q.task);
    const r = arm === "raw" ? armRaw(q.q, dir) : arm === "summary" ? armSummary(q.q, dir) : armTI(q.q, dir);
    if (!q.temporal) continue;
    n++; if (grade(r.answer, q).correct) ok++;
  }
  console.log(`${arm} temporal-only accuracy: ${(100 * ok / n).toFixed(1)}% (${ok}/${n})`);
}
console.log(`\nFull table: results/results.csv  Tokens this run: ~${Object.values(agg).reduce((s, a) => s + a.tok, 0)} (est.)`);
