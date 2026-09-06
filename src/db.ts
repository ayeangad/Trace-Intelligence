import Database from "better-sqlite3";
import { TraceEvent, Claim } from "./models";

/** Minimal SQLite store (events, claims, links). JSON fallback if native build missing. */
export class Store {
  private db: Database.Database | null = null;
  private mem = { events: [] as TraceEvent[], claims: [] as Claim[] };

  constructor(path = ":memory:") {
    try {
      this.db = new Database(path);
      this.db.exec(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session TEXT, time TEXT, type TEXT, text TEXT, path TEXT);
        CREATE TABLE IF NOT EXISTS claims (id TEXT PRIMARY KEY, type TEXT, text TEXT, status TEXT, timestamp TEXT, confidence TEXT, valid_from TEXT, valid_until TEXT, superseded_by TEXT);
        CREATE TABLE IF NOT EXISTS links (claim_id TEXT, event_id TEXT, PRIMARY KEY (claim_id, event_id));`);
    } catch {
      this.db = null; // fallback to in-memory (reproducible, zero tokens)
    }
  }

  saveEvents(events: TraceEvent[]) {
    this.mem.events = events;
    if (!this.db) return;
    const ins = this.db.prepare(`INSERT OR REPLACE INTO events VALUES (?,?,?,?,?,?)`);
    const txn = this.db.transaction((evs: TraceEvent[]) => {
      for (const e of evs) ins.run(e.id, e.session ?? null, e.time, e.type, e.text, e.path ?? null);
    });
    txn(events);
  }

  saveClaims(claims: Claim[]) {
    this.mem.claims = claims;
    if (!this.db) return;
    const c = this.db.prepare(`INSERT OR REPLACE INTO claims VALUES (?,?,?,?,?,?,?,?,?)`);
    const l = this.db.prepare(`INSERT OR REPLACE INTO links VALUES (?,?)`);
    const txn = this.db.transaction((cs: Claim[]) => {
      for (const cl of cs) {
        c.run(cl.id, cl.type, cl.text, cl.status, cl.timestamp, cl.confidence, cl.valid_from, cl.valid_until, cl.superseded_by);
        for (const s of cl.source_spans) l.run(cl.id, s);
      }
    });
    txn(claims);
  }

  get claims(): Claim[] { return this.mem.claims; }
  get events(): TraceEvent[] { return this.mem.events; }
  eventById(id: string): TraceEvent | undefined { return this.mem.events.find(e => e.id === id); }
  close() { this.db?.close(); }
}
