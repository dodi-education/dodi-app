/** dodi docs [topic] */
import { parse, showHelp } from "../lib/args";
import { DOC_TOPICS, renderDoc, type DocTopic } from "../lib/docs";
import { CliError, EXIT, type Output } from "../lib/output";

const USAGE = `dodi docs [${DOC_TOPICS.join("|")}]`;

export async function runDocs(argv: string[], out: Output): Promise<number> {
  if (showHelp(argv, out, USAGE)) return EXIT.ok;
  const args = parse(argv, {}, USAGE);
  const topic = (args.positionals[0] ?? "start") as DocTopic;
  if (!DOC_TOPICS.includes(topic)) throw new CliError(`Unknown topic "${topic}"`, EXIT.usage, USAGE);
  const text = renderDoc(topic);
  out.result({ topic, markdown: text }, () => text);
  return EXIT.ok;
}
