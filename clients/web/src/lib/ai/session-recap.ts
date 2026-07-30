/**
 * Page-load-scoped conversation recap for fresh voice sockets.
 *
 * A brand-new socket knows nothing beyond its system instruction, so Dodi
 * would get amnesia every time one replaces another — on pooled deaf cycles
 * (xAI closes the tainted socket on deafen) and on sleep→wake reconnects.
 * The session store records each finished transcript round here and replays a
 * compact "[CONVERSATION SO FAR]" context frame on the first activation of
 * every fresh socket. Reset on kid switch / endSession — never across kids.
 */

const MAX_RECAP_ROUNDS = 12;
const MAX_RECAP_CHARS = 1500;

interface RecapRound {
  role: "kid" | "dodi";
  text: string;
}

let rounds: RecapRound[] = [];

export function recordRecapRound(role: "kid" | "dodi", text: string): void {
  rounds.push({ role, text });
  if (rounds.length > MAX_RECAP_ROUNDS) {
    rounds = rounds.slice(-MAX_RECAP_ROUNDS);
  }
}

/** The recap context frame, or null when nothing has been said yet. */
export function buildRecapContext(): string | null {
  if (rounds.length === 0) return null;

  // Take the newest rounds that fit the char budget (always at least one).
  const lines: string[] = [];
  let total = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    const speaker = rounds[i].role === "kid" ? "Child" : "You";
    const line = `${speaker}: ${rounds[i].text}`;
    if (lines.length > 0 && total + line.length > MAX_RECAP_CHARS) break;
    lines.unshift(line.length > MAX_RECAP_CHARS ? `${line.slice(0, MAX_RECAP_CHARS)}…` : line);
    total += line.length;
  }

  return (
    "[CONVERSATION SO FAR]\n" +
    "You are resuming an ongoing conversation with the child. This is what was " +
    "said before — do not greet again and do not summarize it back; just " +
    "continue naturally from here.\n" +
    lines.join("\n")
  );
}

export function resetRecap(): void {
  rounds = [];
}
