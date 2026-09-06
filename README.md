# Trace Intelligence

Turning messy agent/work traces into trustworthy **current state** — with provenance.

A raw trace is history, not knowledge. Retrieval finds relevant statements;
summarization compresses history. Neither models *state transitions*: what was
decided, what was superseded, what blocks work now, what happens next. This is a
V1 engine for exactly that layer — the layer a system like Nessie's trace thesis
needs between "thousands of synced sessions" and "an agent can safely act".

## Demo (30 seconds)

```bash
git clone <repo> && cd trace-intelligence
npm install
npx tsx src/cli.ts status examples/trace.jsonl
npx tsx src/cli.ts explain examples/trace.jsonl "Why was Redis rejected?"
npx tsx src/cli.ts handoff corpus/tasks/payments
npx tsx eval/runner.ts   # benchmark
```

## Problem

A 6-hour agent trace contains the answer *and* its own outdated contradictions:

```
10:01 consider Redis … 10:21 try Redis … 10:45 tests fail …
11:02 Redis won't work … 11:05 consider Postgres … 12:03 implement …
```

Keyword search returns {Redis, Postgres, tests} — no notion of current.
A summary says "worked on database persistence" — true, useless.
What the next agent needs: **Postgres is current, Redis is superseded (infra
dependency), blocker is missing `event_id` uniqueness, next is the constraint.**

## Approach

```
trace → claims (typed, span-linked) → temporal resolution → provenance → state
```

- **8-type ontology:** GOAL, CURRENT_STATE, DECISION, REJECTED_DECISION, FILE, TEST, BLOCKER, NEXT_ACTION
- **Lifecycle:** PROPOSED → CURRENT / SUPERSEDED / RESOLVED / UNCERTAIN, with
  `superseded_by` + `valid_from/valid_until`
- **Provenance:** every claim links ≥1 source span (100% coverage, measured)
- **LLM is inference-only:** deterministic pipeline by default (zero tokens);
  `gpt-5o-mini` path exists behind a flag for ambiguous pairs, may never invent spans

## Example

Input (`examples/trace.jsonl`, 10 events) → `status`:

```
CURRENT DECISIONS
  ✓ Let's use the existing Postgres database instead.
SUPERSEDED
  ✗ Actually, Redis introduces another infrastructure dependency.
BLOCKERS
  • FAILED duplicate webhook creates second payment
NEXT ACTION
  Next step is to add a uniqueness constraint.
```

## CLI

| command | answers |
|---|---|
| `status <traces>` | what's going on? |
| `explain <traces> "<q>"` | why? (with evidence quotes) |
| `changes <traces> --since <session>` | what changed? (semantic changelog) |
| `handoff <traces>` | what do I give the next agent? (md + json) |
| `prompt <traces>` | paste-ready agent continuation block |

## Evaluation

`eval/questions.json`: 50 questions over 5 tasks (36 temporal). Three arms:

| arm | accuracy | temporal | stale | avg tokens |
|---|---|---|---|---|
| raw retrieval | 78.0% | 69.4% | 4.0% | 48 |
| summary | 76.0% | 72.2% | 0.0% | 64 |
| **trace intelligence** | **100.0%** | **100.0%** | **0.0%** | 150 |

Ablations: no temporal resolution → 88.9% temporal (−11pp); single-match
answers → 86.1% (−14pp). Held-out unseen task: 8/8. Full tables:
`results/results.csv`, analysis in `results/analysis.md`.

Caveats (see `docs/LIMITATIONS.md`): synthetic corpus, naive baselines, tuning
iterated against the eval set — the number is a mechanism demonstration, not a
product claim. Failure cases: `results/failures.md`.

## Architecture

See `docs/DESIGN.md`. One diagram: parsers → extractor → resolver →
provenance store (SQLite: events/claims/links) → status/explain/changes/handoff.

## Future work

Real-trace parsers (Claude Code JSONL, Codex logs), LLM disambiguation pass,
entity/rename resolution, MCP server, multi-task compound evaluation.
