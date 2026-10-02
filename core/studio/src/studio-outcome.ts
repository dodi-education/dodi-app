/**
 * What a finished build changes in the studio's game. The build has already
 * persisted the row; the studio adopts the result so the next build in the
 * same session starts from it. Shared by the web studio and the mobile app.
 */

import type { StudioBuildOutcome } from "./build-runner";
import type { StudioGame } from "./studio-game";

type BuiltOutcome = Extract<StudioBuildOutcome, { kind: "built" }>;

export function gameAfterBuild(game: StudioGame, outcome: BuiltOutcome): StudioGame {
  const { result, code, savedRow } = outcome;
  const capabilities = Array.isArray(result.metadata.capabilities)
    ? (result.metadata.capabilities as string[])
    : [];
  return {
    ...game,
    built: true,
    title: result.title,
    tags: result.tags,
    description: result.description,
    learningGoal: result.learningGoal,
    successDefinition: result.successDefinition,
    progressKind: result.progressKind,
    // Keeps the next build in this session seeded with a fresh baseline.
    successCriteria: result.successCriteria,
    codeBundle: code,
    markdown: result.markdown,
    capabilities,
    // Adopt the server's new version head (a build persist appends a version)
    // and the freshly persisted list preview, if any.
    ...(savedRow
      ? {
          currentGameVersionId: savedRow.current_game_version_id,
          previewImage: savedRow.preview_image,
        }
      : {}),
  };
}
