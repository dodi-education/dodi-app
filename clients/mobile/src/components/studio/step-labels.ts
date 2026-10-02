import { useTranslations } from "use-intl";
import type { AgentStep } from "@dodi/types/agent-progress";

/** The header status line while a build runs (web: game-studio stepLabel). */
const STATUS_KEYS: Record<AgentStep, string> = {
  thinking: "stepThinking",
  reading_docs: "stepReadingDocs",
  generating_image: "stepGeneratingImage",
  generating_preview: "stepGeneratingPreview",
  writing_code: "stepWritingCode",
  validating: "stepValidating",
  fixing_validation: "stepFixingValidation",
  visual_check: "stepVisualCheck",
  finalizing: "stepFinalizing",
};

/** A step on the run timeline (web: agent-run-timeline useStepLabel). */
const RUN_LOG_KEYS: Record<AgentStep, string> = {
  thinking: "runLogStepThinking",
  reading_docs: "runLogStepReadingDocs",
  generating_image: "runLogStepGeneratingImage",
  generating_preview: "runLogStepGeneratingPreview",
  writing_code: "runLogStepWritingCode",
  validating: "runLogStepValidating",
  fixing_validation: "runLogStepFixingValidation",
  visual_check: "runLogStepVisualCheck",
  finalizing: "runLogStepFinalizing",
};

export function useStepLabel(kind: "status" | "runLog"): (step: AgentStep) => string {
  const t = useTranslations("gameStudio");
  const keys = kind === "status" ? STATUS_KEYS : RUN_LOG_KEYS;
  return (step) => t(keys[step]);
}
