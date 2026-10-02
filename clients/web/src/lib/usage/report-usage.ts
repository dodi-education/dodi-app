/**
 * Fire-and-forget AI usage reporting (shared implementation:
 * @dodi/client-state/telemetry). The `/api/usage` route stamps `account_id`
 * from the auth token, so the client never sends it.
 */
import { createTelemetry } from "@dodi/client-state/telemetry";
import type { UsageReport } from "@dodi/types/usage";

import { dodi } from "@/lib/api";

const telemetry = createTelemetry(dodi);

export function reportUsage(report: UsageReport, opts?: { keepalive?: boolean }): void {
  telemetry.reportUsage(report, opts);
}
