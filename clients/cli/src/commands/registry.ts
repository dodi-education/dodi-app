/** The top-level commands, shared by the shell entry point and `dodi mcp`. */
import type { Output } from "../lib/output";
import { runLogout, runWhoami } from "./account";
import { runAssets } from "./assets";
import { runDocs } from "./docs";
import { runGames } from "./games";
import { runKids } from "./kids";
import { runLogin } from "./login";

export interface Command {
  summary: string;
  run(argv: string[], out: Output): Promise<number>;
}

export const COMMANDS: Record<string, Command> = {
  login: { summary: "connect to a dodi family (the parent approves a link)", run: (argv, out) => runLogin(argv, out) },
  whoami: { summary: "show this connection", run: runWhoami },
  logout: { summary: "disconnect and delete the local keys", run: runLogout },
  docs: { summary: "the authoring guide (start here)", run: runDocs },
  kids: { summary: "the kids you build for", run: runKids },
  games: { summary: "create, check, push and publish games", run: runGames },
  assets: { summary: "custom companion avatars and accessories", run: runAssets },
};
