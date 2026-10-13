/**
 * `dodi docs`: what an agent needs, offline and versioned with the CLI. The
 * agent does not write games: it briefs dodi's own game agent and reviews
 * what it builds, like a parent in Game Studio. So the docs are about
 * briefing and reviewing, not about the game format.
 */
import { ASSET_DOC } from "./asset-docs";

const START = `# Making games on dodi with the dodi CLI

dodi is a learning platform for kids. You make games for a family the way a
parent does in dodi's Game Studio: you describe the game, dodi's own game
agent builds it (with pictures, a visual check and translations), you look at
the result and ask for changes. Everything is sealed on this machine before
it is uploaded; the dodi server never sees the family's content.

If \`dodi\` is not installed yet: \`npm install -g @dodi-education/cli\` (Node 20+).

## Workflow
1. \`dodi login\` prints an approval link. Send it to the parent and wait.
   If it exits with code 3 (pending), run \`dodi login --resume\` after the
   parent approved.
2. \`dodi kids\` shows who you are making the game for.
3. \`dodi studio new "<brief>"\`: plan the game with dodi. Answer dodi's
   questions with \`dodi studio plan "<answer>"\` until the plan is right.
4. \`dodi studio build\`: dodi builds the plan. It runs in the background:
   \`dodi studio wait\` until it is done (run it again while it says it is
   still building). It prints dodi's reply and saves screenshots: look at them.
5. \`dodi studio send "<feedback>"\`, then \`dodi studio wait\`. Repeat until
   the game is right.
6. Tell the parent the game is ready. Only if they ask: \`dodi studio activate\`
   (the kids can play it) and \`dodi games publish\` (dodi Discover, reviewed).

Read \`dodi docs studio\` before your first brief.

## Topics
dodi docs studio      how to brief dodi's game agent and review its work
dodi docs reference   every command, exit codes, environment
dodi docs assets      custom companion avatars and accessories (3D, glTF)
`;

const STUDIO = `# Briefing and reviewing dodi's game agent

You play the parent's part. dodi's game agent writes the game; your job is a
clear brief and specific feedback. The parent reads this conversation later
in the app, so write the way you would to a person.

## A good brief (\`dodi studio new\`)
- Who plays: the kid's age (see \`dodi kids\`) and what they like. Never put
  a kid's name or personal details into the brief: say "a 6-year-old who
  loves dinosaurs", not their name.
- What they should learn (the learning goal), and how you'd know they did
  (the success definition), e.g. "counts up to 10 correctly five times".
- The idea and the feel: theme, characters, calm or fast, how a round works.
- Anything that matters to the parent (no timers, big buttons, a specific
  topic from school).
dodi answers with questions or a plan. Answer with \`dodi studio plan\`.
When the plan reads right, \`dodi studio build\` (or \`--plan "<text>"\` to
build your own edited version of it).

## Reviewing a build (\`dodi studio wait\`)
- Read dodi's reply: what it built or changed.
- Open the screenshots it lists. They are the frames dodi's own visual check
  looked at. Check: is everything readable, nothing overlaps, it looks
  friendly and fits a kid of that age, the game makes sense from the first
  screen.
- Notices about the background or preview picture, or a visual check that
  still found problems, are worth a follow-up.

## Feedback (\`dodi studio send\`)
- One topic per round, concrete: "The answer buttons are too small for a
  5-year-old; make them twice as big", not "improve the UI".
- Point at what you saw: "In the second screenshot the score covers the
  question."
- You can attach a reference picture: \`--image <file.png>\`.
- A few rounds are normal. Stop when it is right; don't polish forever.

## Settings (\`dodi studio settings\`)
\`dodi studio settings\` shows the game's settings: title, learning goal,
success definition, ages, perspective, and whether dodi draws the preview
and background pictures. Change them only when the parent asks, and never
switch a picture on that the parent switched off. A game without a preview
picture (e.g. one made by hand) gets one like this:
  dodi studio settings --preview-image on
  dodi studio send "Make a preview picture for the game list"
  dodi studio wait
Settings take effect from the next build.

## When you are done
Tell the parent what you made and that they can try it in the app. They
decide whether the kids can play it (\`dodi studio activate\` only when they
ask) and whether to share it on Discover (\`dodi games publish\`).
`;

const REFERENCE = `# dodi CLI reference

## Connection
dodi login [--name <n>] [--scopes <list>] [--wait <s>] [--resume] [--token <dodi_ak_…>] [--force]
dodi whoami
dodi logout                 disconnect and delete this agent's keys

## Studio (the current game is remembered; --game <id> picks another)
dodi studio new "<brief>" [--kid <id>]
dodi studio plan "<message>"
dodi studio build [--plan "<text>"]
dodi studio send "<feedback>" [--image <file>]...
dodi studio wait [--timeout <s>]     default 110 s; exit 3 = still building
dodi studio show
dodi studio stop | resume
dodi studio open <game id>
dodi studio settings [--title <t>] [--learning-goal <t>] [--success "<definition>"]
                     [--ages <min>-<max>] [--perspective bird|side|isometric|auto]
                     [--preview-image on|off] [--background-image on|off]
                                     no flags: show them; only when the parent asks
dodi studio activate

## Games
dodi games list
dodi games publish [<game id>]       translates, then submits to dodi Discover
dodi games status [<game id>]
dodi games pull <game id> [<folder>] manual edits: edit game.html / game.md,
dodi games push [<folder>]           then push them back as a new version

## Other
dodi kids [--memory <kid id>]
dodi assets new|check|push|list|pull|publish|status   (see dodi docs assets)
dodi mcp                             the same commands as an MCP server (stdio)

## Exit codes
0 ok, 1 error, 2 usage, 3 waiting (approval or a running build), 4 check
failed, 5 not connected (log in again), 6 missing permission.
Every command takes --json.

## Environment
DODI_API_URL, DODI_APP_URL   a self-hosted dodi
DODI_CONFIG_DIR              where keys, checkpoints and build state live
DODI_TOKEN                   an access key (dodi_ak_…), wins over the stored login
`;

export const DOC_TOPICS = ["start", "studio", "reference", "assets"] as const;

export type DocTopic = (typeof DOC_TOPICS)[number];

export function renderDoc(topic: DocTopic): string {
  switch (topic) {
    case "start":
      return START;
    case "studio":
      return STUDIO;
    case "reference":
      return REFERENCE;
    case "assets":
      return ASSET_DOC;
  }
}
