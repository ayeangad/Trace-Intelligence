# Failure analysis

## FAILURE #01 — substring "was" boosted every stale claim (found & fixed)

Question: `Why was the LRU removed?` (caching)
System answered with the superseded Redis/LRU decision instead of the removal + stampede cause.
Cause: the explainer boosted `SUPERSEDED` claims whenever the query matched
`/previous|before|was/` — and "was" appears as an auxiliary verb in nearly every
"why was X" question. A recency tie-break existed but never fired because the
stale claim outscored the current one.
Lesson: relevance triggers must be word-boundary aware *and* semantically narrow.
Fix: trigger only on `\b(previous|before|superseded)\b`; rank ties by recency.

## FAILURE #02 — single-sentence "Let's use X instead" split into phantom rejection (found & fixed)

After adding mixed-message splitting ("X won't work... decided Y" → two claims),
overall accuracy dropped 98% → 96%.
Cause: the splitter fired on single-sentence decisions like
"Let's use the existing Postgres database instead", creating a REJECTED_DECISION
claim with identical text to the DECISION. The phantom claim then absorbed
`why/reject` boosts and displaced real answers.
Lesson: a transformation that helps multi-sentence messages hurts single-sentence
ones — gate on structure (≥2 sentences with distinct rejection and decision
clauses), not just keyword presence.
Fix: split only when rejection and decision live in different sentences.

## FAILURE #03 — speculation outranked decisions (found & fixed)

Question: `What database is currently used?` → answered "We need to add
idempotency..." (the GOAL).
Cause: two compounding issues. (a) Speculative messages ("Maybe offset is fine,
it is simple to implement") matched the GOAL pattern via the word "implement"
and entered the state as CURRENT. (b) The explainer had no status priority, so an
early GOAL beat a later DECISION on ties.
Lesson: speculation must be quarantined at extraction (LOW confidence →
UNCERTAIN, never GOAL), *and* ranking must prefer CURRENT decisions/state over
goals and uncertain claims. Defense in depth.
Fix: speculation guard first in the extractor; status/type priority + recency
tie-break in ranking.

## OPEN #04 — renames and multi-hop removals (not fixed, V1 limit)

The resolver links supersession by topic-word overlap. It handles direct pairs
(Redis → Postgres, LRU → removed) but has no alias model: if `src/api.py` is
renamed to `src/server.py` across sessions, V1 reports two files. Likewise a
three-hop chain (A → B → B removed → C) resolves pairwise but was never tested.
Next step: explicit `RENAMED_TO` / multi-hop chain tests in the corpus, then an
entity-resolution pass before temporal resolution.
