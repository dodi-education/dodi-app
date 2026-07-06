let enabled = true;

const PREFIX = "[Dodi Game]";

// Millisecond-precision local wall-clock stamp so log lines can be timed against
// each other (e.g. how long the spoken ack runs before the tool call arrives).
function timestamp(): string {
  const d = new Date();
  const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function setGameDebug(value: boolean): void {
  enabled = value;
  console.log(`${PREFIX} Debug ${value ? "enabled" : "disabled"}`);
}

export function isGameDebugEnabled(): boolean {
  return enabled;
}

export function gameDebug(area: string, message: string, ...data: unknown[]): void {
  if (!enabled) return;
  if (data.length > 0) {
    console.log(`${PREFIX} [${timestamp()}] [${area}] ${message}`, ...data);
  } else {
    console.log(`${PREFIX} [${timestamp()}] [${area}] ${message}`);
  }
}

export function gameDebugWarn(area: string, message: string, ...data: unknown[]): void {
  if (!enabled) return;
  if (data.length > 0) {
    console.warn(`${PREFIX} [${timestamp()}] [${area}] ${message}`, ...data);
  } else {
    console.warn(`${PREFIX} [${timestamp()}] [${area}] ${message}`);
  }
}
