/** dodi docs [topic] [--perspective bird|side|isometric] */
import type { GamePerspective } from "@dodi/types/games";

import { parse } from "../lib/args";
import { DOC_TOPICS, renderDoc, type DocTopic } from "../lib/docs";
import { CliError, EXIT, type Output } from "../lib/output";

const USAGE = `dodi docs [${DOC_TOPICS.join("|")}] [--perspective bird|side|isometric]`;

export async function runDocs(argv: string[], out: Output): Promise<number> {
  const args = parse(argv, { perspective: { type: "string" } }, USAGE);
  const positionals = args.positionals;
  const topic = (positionals[0] ?? "start") as DocTopic;
  if (!DOC_TOPICS.includes(topic)) throw new CliError(`Unknown topic "${topic}"`, EXIT.usage, USAGE);
  const perspective = args.str("perspective") as GamePerspective | undefined;
  if (perspective && !["bird", "side", "isometric"].includes(perspective)) {
    throw new CliError("--perspective must be bird, side or isometric", EXIT.usage, USAGE);
  }
  const text = renderDoc(topic, { perspective });
  out.result({ topic, markdown: text }, () => text);
  return EXIT.ok;
}
