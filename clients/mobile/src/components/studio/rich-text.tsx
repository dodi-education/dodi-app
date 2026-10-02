import { View } from "react-native";
import { richText } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

type Block = { kind: "text"; text: string } | { kind: "list"; items: string[] };

/** Split the text into paragraphs and "- " bullet runs (the web's RichText rules). */
function toBlocks(text: string): Block[] {
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
  return blocks;
}

/**
 * **bold** runs inside a line, as nested Text. `className` is the enclosing
 * text style: the app's Text applies its defaults to nested runs too, so they
 * restate it.
 */
export function BoldText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <Text key={i} className={cn(className, richText.bold)}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        ),
      )}
    </>
  );
}

/**
 * Minimal markdown shared by the chat thread and the plan card (web:
 * parent/games/rich-text): **bold** inline, and consecutive "- " lines as a
 * bullet list. `textClassName` is the surrounding text style (React Native
 * does not inherit it from the container).
 */
export function RichText({ text, textClassName }: { text: string; textClassName?: string }) {
  const blocks = toBlocks(text);
  // A single plain line (the common case) stays one inline text.
  if (blocks.length === 1 && blocks[0].kind === "text") {
    return (
      <Text className={textClassName}>
        <BoldText text={blocks[0].text} className={textClassName} />
      </Text>
    );
  }
  return (
    <View>
      {blocks.map((b, i) =>
        b.kind === "list" ? (
          <View key={i} className={cn(richText.list, richText.listGap, i === 0 && "mt-0")}>
            {b.items.map((it, j) => (
              <View key={j} className="flex-row">
                <Text className={cn(textClassName, "w-3")} accessibilityElementsHidden>
                  •
                </Text>
                <Text className={cn(textClassName, "flex-1")}>
                  <BoldText text={it} className={textClassName} />
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text key={i} className={cn(textClassName, richText.paragraph, i === 0 && "mt-0")}>
            <BoldText text={b.text} className={textClassName} />
          </Text>
        ),
      )}
    </View>
  );
}
