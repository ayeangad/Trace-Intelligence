// Core data model. LLM is inference-only; these structs are the source of truth.

export type EventType =
  | "message" | "tool_call" | "tool_result"
  | "file_change" | "command" | "test" | "error" | "decision";

export interface TraceEvent {
  id: string;
  time: string;          // HH:MM or ISO; preserved verbatim
  session?: string;      // session file it came from
  type: EventType;
  text: string;
  path?: string;         // file path for tool_call/file_change
  tool?: string;
  command?: string;
}

export type ClaimType =
  | "GOAL" | "CURRENT_STATE" | "DECISION" | "REJECTED_DECISION"
  | "FILE" | "TEST" | "BLOCKER" | "NEXT_ACTION";

export type ClaimStatus = "PROPOSED" | "CURRENT" | "SUPERSEDED" | "RESOLVED" | "UNCERTAIN";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface Claim {
  id: string;
  type: ClaimType;
  text: string;
  status: ClaimStatus;
  timestamp: string;
  confidence: Confidence;
  source_spans: string[];      // event ids
  valid_from: string;
  valid_until: string | null;
  superseded_by: string | null;
}

export interface StateSnapshot {
  goal: Claim[];
  current_state: Claim[];
  decisions: Claim[];
  superseded: Claim[];
  resolved: Claim[];
  blockers: Claim[];
  next_actions: Claim[];
  files: Claim[];
  tests: Claim[];
  uncertain: Claim[];
}
