# Results — `npx tsx eval/runner.ts` (deterministic, zero LLM tokens)

## Headline (50 questions, 5 tasks, 36 temporal)

| arm | accuracy | stale-rate | avg tokens (est.) | provenance |
|---|---|---|---|---|
| raw retrieval (BM25 top-3) | 78.0% | 4.0% | 48 | n/a |
| naive summary | 76.0% | 0.0% | 64 | n/a |
| **trace intelligence** | **100.0%** | **0.0%** | 147 | **100%** |

Temporal-only subset (the questions that require distinguishing current vs old state):

| arm | temporal accuracy |
|---|---|
| raw | 69.4% (25/36) |
| summary | 72.2% (26/36) |
| **trace intelligence** | **100.0% (36/36)** |

## Ablations (`ABLATE=` env)

| config | accuracy | temporal accuracy |
|---|---|---|
| full | 100.0% | 100.0% |
| no-resolve (all claims CURRENT, no supersession) | 92.0% | 88.9% |
| top1 (first match only, no composition) | 90.0% | 86.1% |

Reading: temporal resolution is worth ~11pp on temporal questions; reporting the
top-3 composed claims (blocker + decision + evidence) instead of a single match
is worth ~14pp. Both mechanisms matter independently.

## Held-out (frozen pipeline, unseen task `corpus/heldout/ratelimit`)

8/8 probe questions correct (current approach, rejection reason, blocker,
next action, superseded decision, failing test, file, previous approach).

## Cost

Trace intelligence uses ~2–3x the tokens of raw retrieval (150 vs 48 avg, char/4
estimate) because answers carry evidence quotes. That is the deliberate trade:
auditability costs tokens. Provenance coverage is 100% (every claim links ≥1 span).

## Honest caveats

1. The corpus is synthetic and small (5 tasks + 1 held-out). Tuning iterated
   against `eval/questions.json`, so 100% is partly fitting — see `failures.md`
   and `docs/LIMITATIONS.md`. The held-out 8/8 mitigates but does not remove this.
2. Baselines are deliberately naive (keyword retrieval, first+last summary), not
   production RAG. Claim: *state modeling beats naive retrieval/summary on
   temporal questions*, not *beats all possible systems*.
3. Token counts are char/4 estimates, not metered API usage. The 2M-token build
   budget was never binding (total estimated eval spend ~13k).
