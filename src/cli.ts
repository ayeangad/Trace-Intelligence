#!/usr/bin/env node
import { loadTraces } from "./parser";
import { extractClaims } from "./extractor";
import { resolveClaims, snapshot } from "./resolver";
import { renderStatus, renderHandoff, renderPrompt, explain, changes } from "./handoff";
import { Store } from "./db";
import { basename } from "path";

function pipeline(path: string) {
  const events = loadTraces(path);
  const resolved = resolveClaims(extractClaims(events));
  const store = new Store(":memory:");
  store.saveEvents(events);
  store.saveClaims(resolved);
  const ev = new Map(events.map(e => [e.id, e]));
  return { events, resolved, snap: snapshot(resolved), ev, store };
}

const [cmd, target, ...rest] = process.argv.slice(2);
const name = target ? basename(target).replace(/\.jsonl$/, "") : "traces";

try {
  switch (cmd) {
    case "status": {
      const p = pipeline(target);
      console.log(renderStatus(name, p.snap, p.resolved));
      break;
    }
    case "handoff": {
      const p = pipeline(target);
      const md = renderHandoff(name, p.snap, p.ev);
      console.log(md);
      if (rest.includes("--json")) {
        const { writeFileSync, mkdirSync } = require("fs");
        mkdirSync("results", { recursive: true });
        writeFileSync("results/handoff.json", JSON.stringify(p.resolved, null, 2));
      }
      break;
    }
    case "prompt": {
      const p = pipeline(target);
      console.log(renderPrompt(name, p.snap));
      break;
    }
    case "explain": {
      const p = pipeline(target);
      console.log(explain(rest.join(" "), p.resolved, p.ev));
      break;
    }
    case "changes": {
      const since = (rest[rest.indexOf("--since") + 1] ?? "");
      const p = pipeline(target);
      console.log(changes(since, p.resolved, p.events));
      break;
    }
    default:
      console.log(`trace-intel <status|explain|changes|handoff|prompt> <path> [--since X] [--json]`);
      process.exit(1);
  }
} catch (e: any) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
