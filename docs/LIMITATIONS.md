# Limitations (honest)

1. **Synthetic corpus.** 5 tasks + 1 held-out, hand-authored in the same style as
   the extractor's patterns. Tuning iterated against `eval/questions.json`, so
   the 100% headline is partly fitting. The 8/8 held-out mitigates this; a real
   validation needs raw Claude Code / Codex session exports, which V1 does not parse.
2. **Naive baselines.** Keyword retrieval and first+last summarization are weak
   opponents chosen to isolate the *mechanism* (state modeling). No comparison
   against production RAG, embeddings, or any Nessie system — none was accessed.
3. **Topic-overlap resolution is shallow.** Supersession links by shared keywords
   (`redis`, `postgres`, ...). Paraphrase ("KV store" vs "Redis"), renames, and
   3+-hop chains (OPEN #04 in `failures.md`) will break it. An LLM disambiguation
   pass is designed (`prompts.ts`) but not wired by default.
4. **Single-user, single-thread.** No multi-author conflict, no permissions, no
   team sharing semantics. No scale testing (largest task: 11 events).
5. **Token counts are estimates** (chars/4), not metered usage. The `--llm` path
   requires `OPENAI_API_KEY` and has not been exercised end-to-end in this build.
6. **No MCP server.** Agent interop is a paste-ready `prompt` command, deliberately —
   a full MCP surface is week-2 work, not V1.
