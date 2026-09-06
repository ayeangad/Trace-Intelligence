import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { TraceEvent, EventType } from "./models";

const VALID_TYPES = new Set(["message","tool_call","tool_result","file_change","command","test","error","decision"]);

/** Normalize raw JSONL (any source) into TraceEvent[]. Unknown types -> message. */
export function parseJsonl(text: string, session?: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const raw = JSON.parse(t);
    const type: EventType = VALID_TYPES.has(raw.type) ? raw.type : "message";
    events.push({
      id: String(raw.id ?? `e${events.length + 1}`),
      time: String(raw.time ?? raw.timestamp ?? ""),
      session,
      type,
      text: String(raw.text ?? raw.command ?? raw.path ?? ""),
      path: raw.path,
      tool: raw.tool,
      command: raw.command,
    });
  }
  return events.sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
}

export function loadTraces(path: string): TraceEvent[] {
  const st = statSync(path);
  if (st.isDirectory()) {
    const out: TraceEvent[] = [];
    for (const f of readdirSync(path).sort()) {
      if (!f.endsWith(".jsonl")) continue;
      const session = f.replace(/\.jsonl$/, "");
      out.push(...parseJsonl(readFileSync(join(path, f), "utf8"), session));
    }
    return out;
  }
  const session = path.split("/").pop()?.replace(/\.jsonl$/, "");
  return parseJsonl(readFileSync(path, "utf8"), session);
}
