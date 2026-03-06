import type { GameCommand } from "@/types/games";
import { gameDebug, gameDebugWarn } from "@/lib/games/debug";

const COMMAND_MARKER_REGEX = /<dodi-command>([\s\S]*?)<\/dodi-command>/g;

export interface ParsedCommandMarkers {
  cleanedText: string;
  commands: GameCommand[];
}

export function extractCommandMarkers(text: string): ParsedCommandMarkers {
  gameDebug("markers", `Extracting from text (${text.length} chars): "${text.slice(0, 200)}${text.length > 200 ? "..." : ""}"`);

  const hasMarker = text.includes("<dodi-command>");
  gameDebug("markers", `Contains <dodi-command> tag: ${hasMarker}`);

  const commands: GameCommand[] = [];
  const cleaned = text.replace(COMMAND_MARKER_REGEX, (_match, jsonPayload: string) => {
    gameDebug("markers", `Found marker with JSON payload: "${jsonPayload.slice(0, 300)}"`);
    try {
      const parsed = JSON.parse(jsonPayload) as unknown;
      if (Array.isArray(parsed)) {
        gameDebug("markers", `Parsed as array with ${parsed.length} items`);
        for (const item of parsed) {
          if (isGameCommand(item)) {
            commands.push(item);
            gameDebug("markers", `Valid command:`, item);
          } else {
            gameDebugWarn("markers", `Invalid command in array:`, item);
          }
        }
      } else if (isGameCommand(parsed)) {
        commands.push(parsed);
        gameDebug("markers", `Valid command:`, parsed);
      } else {
        gameDebugWarn("markers", `Parsed JSON is not a valid command:`, parsed);
      }
    } catch (error) {
      gameDebugWarn("markers", `Failed to parse JSON in marker: ${error}`);
    }
    return "";
  });

  gameDebug("markers", `Result: ${commands.length} commands extracted, cleaned text: "${cleaned.slice(0, 100)}..."`);

  return {
    cleanedText: cleaned.replace(/\n{3,}/g, "\n\n").trim(),
    commands,
  };
}

function isGameCommand(value: unknown): value is GameCommand {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || record.type.length === 0) return false;
  if (record.payload === undefined) return true;
  return typeof record.payload === "object" && record.payload !== null;
}
