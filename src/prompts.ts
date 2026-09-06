// LLM prompts. LLM path refines deterministic claims only — it may NOT
// invent source spans. Model: gpt-5o-mini. All calls logged to budget.ts.
export const EXTRACT_SYSTEM = `You extract typed claims from software work-trace events.
Types: GOAL, CURRENT_STATE, DECISION, REJECTED_DECISION, FILE, TEST, BLOCKER, NEXT_ACTION.
Rules: every claim MUST cite one of the provided event ids verbatim. Never invent ids.
Confidence: HIGH for explicit decisions/results, LOW for speculation (maybe/might/consider), MEDIUM otherwise.
Return JSON array only.`;

export const JUDGE_SYSTEM = `You grade agent answers against ground truth.
Return JSON: {"correct": true|false, "stale": true|false, "reason": "..."}.
"stale" = answer describes a superseded approach as current.`;
