"use client";

import { useEffect, useState } from "react";
import {
  decideFigureMode,
  FIGURE_DECISION_BUDGET_MS,
  type FigureMode,
  type FigureModeInput,
} from "@dodi/character/figure-mode";

/**
 * This view's companion figure (2D or 3D), decided once before anything
 * shows (@dodi/character/figure-mode; the app's twin: components/dodi/
 * use-figure-mode). The time since mount re-evaluates at the budget, so a
 * slow 3D load settles on 2D then.
 */
export function useFigureMode(is3dEnabled: boolean | null, load: FigureModeInput["load"]): FigureMode {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [decided, setDecided] = useState<FigureMode>("pending");

  useEffect(() => {
    const timer = setTimeout(() => setElapsedMs(FIGURE_DECISION_BUDGET_MS), FIGURE_DECISION_BUDGET_MS);
    return () => clearTimeout(timer);
  }, []);

  const mode = decideFigureMode({ is3dEnabled, load, elapsedMs, previous: decided });
  // The decision is this mount's `previous` from now on (stored during render,
  // React's pattern for state derived from earlier renders).
  if (mode !== decided) setDecided(mode);
  return mode;
}
