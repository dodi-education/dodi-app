/**
 * The browser's in-game generators (`@dodi/client-state/game-companion`): the
 * coloring sheet and the content-slot text, over this app's client state.
 */
import { createGameGenerators } from "@dodi/client-state/game-companion";

import { clientState } from "@/lib/client-state";
import { reportUsage } from "@/lib/usage/report-usage";

export const gameGenerators = createGameGenerators({
  kids: clientState.kids,
  execution: clientState.execution,
  reportUsage,
});
