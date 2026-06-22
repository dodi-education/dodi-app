let enabled = true;

const PREFIX = "[Dodi Game]";

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
    console.log(`${PREFIX} [${area}] ${message}`, ...data);
  } else {
    console.log(`${PREFIX} [${area}] ${message}`);
  }
}

export function gameDebugWarn(area: string, message: string, ...data: unknown[]): void {
  if (!enabled) return;
  if (data.length > 0) {
    console.warn(`${PREFIX} [${area}] ${message}`, ...data);
  } else {
    console.warn(`${PREFIX} [${area}] ${message}`);
  }
}
