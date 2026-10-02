/**
 * The app's in-game generators (`@dodi/client-state/game-companion`): the
 * coloring sheet and the content-slot text dodi makes during play, with the
 * vault-held keys on this device (web: lib/ai/game-generators).
 */
import { createGameGenerators } from "@dodi/client-state/game-companion";
import { createTelemetry } from "@dodi/client-state/telemetry";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

const telemetry = createTelemetry(api);

export const gameGenerators = createGameGenerators({
  kids: clientState.kids,
  execution: clientState.execution,
  reportUsage: (report, opts) => telemetry.reportUsage(report, opts),
});
