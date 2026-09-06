import { appendFileSync, existsSync, mkdirSync } from "fs";
// 2M token hard cap for the whole build (gpt-5o-mini).
const CAP = 2_000_000;
const LOG = "results/tokens.csv";

export class Budget {
  total = 0;
  constructor() {
    if (existsSync(LOG)) {
      const lines = require("fs").readFileSync(LOG, "utf8").split("\n").slice(1);
      for (const l of lines) {
        const m = l.split(",");
        if (m[2]) this.total += Number(m[2]) || 0;
      }
    }
  }
  charge(label: string, tokens: number) {
    this.total += tokens;
    if (this.total > CAP) throw new Error(`Token budget exceeded: ${this.total} > ${CAP} at ${label}`);
    mkdirSync("results", { recursive: true });
    if (!existsSync(LOG)) appendFileSync(LOG, "label,tokens,cumulative\n");
    appendFileSync(LOG, `${label},${tokens},${this.total}\n`);
  }
}
