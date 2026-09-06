# Architecture

```
JSONL traces ──▶ normalizer ──▶ events ──▶ extractor ──▶ claims ──▶ resolver ──▶ current state
(parser.ts)      (Event[])      (deterministic,        (PROPOSED→CURRENT/
                                 zero tokens)          SUPERSEDED/RESOLVED/
                                                       UNCERTAIN)
                                                          │
                                              ┌───────────┼───────────┐
                                              ▼           ▼           ▼
                                            status      explain     changes
                                           handoff      prompt
```

## Principles

1. **LLM is inference-only, never the store.** All ground truth lives in
   `events / claims / links` (SQLite via `db.ts`, in-memory fallback).
   The `--llm` path (prompts in `prompts.ts`, model `gpt-5o-mini`) may only
   *refine* deterministic claims; it may never invent source spans.
   Default runs are fully deterministic and token-free.
2. **Temporality sits above retrieval.** Embedding similarity cannot tell
   "Use Redis" from "Don't use Redis". Supersession is an explicit relation
   (`superseded_by`, `valid_from/valid_until`), computed by rules first
   (explicit negation, topic overlap, test-pass resolves test-fail).
3. **Provenance is mandatory.** Every claim carries `source_spans`. Coverage is
   measured (currently 100%) and reported in `status`.
4. **Uncertainty is explicit.** Speculation → LOW confidence → UNCERTAIN status,
   ranked below CURRENT claims, never silently dropped.

## Modules

| file | owns |
|---|---|
| `models.ts` | Event / Claim / StateSnapshot types, 8-type ontology |
| `parser.ts` | JSONL → normalized events (any source format) |
| `extractor.ts` | deterministic claim extraction + speculation guard + mixed-message split |
| `resolver.ts` | temporal lifecycle, topic-overlap supersession, blocker resolution |
| `handoff.ts` | status / explain / changes / handoff / prompt rendering + ranked retrieval |
| `db.ts` | better-sqlite3 store (`events, claims, links`), in-memory fallback |
| `budget.ts` | 2M-token hard cap ledger (`results/tokens.csv`) |
| `prompts.ts` | LLM extraction/judge prompts (flag-gated, unused by default) |

## Why not a vector DB?

The core operation is "which statement is currently authoritative", not "which
text is most similar". Similarity conflates a superseded decision with its
replacement. V1 uses keyword + type/status ranking over a small claim set; a
vector index would only help at thousands-of-claims scale and still needs the
temporal layer above it.
