/**
 * Minimal markdown rendering shared by the studio's chat thread and its plan
 * card: **bold** inline; consecutive "- " lines (the agent's changeSummary and
 * plan-summary format) render as a bullet list instead of literal dashes.
 */

export function RichText({ text }: { text: string }) {
  type Block = { kind: "text"; text: string } | { kind: "list"; items: string[] };
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    const item = /^\s*-\s+(.*)/.exec(line);
    if (item) {
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "list") prev.items.push(item[1]);
      else blocks.push({ kind: "list", items: [item[1]] });
    } else if (line.trim()) {
      blocks.push({ kind: "text", text: line });
    }
  }
  // Single plain line (the common case) stays inline, exactly as before.
  if (blocks.length === 1 && blocks[0].kind === "text") return <BoldText text={blocks[0].text} />;
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === "list" ? (
          <ul key={i} className="mt-1 list-disc space-y-0.5 pl-4 first:mt-0">
            {b.items.map((it, j) => (
              <li key={j}>
                <BoldText text={it} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mt-1 first:mt-0">
            <BoldText text={b.text} />
          </p>
        ),
      )}
    </>
  );
}

export function BoldText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
