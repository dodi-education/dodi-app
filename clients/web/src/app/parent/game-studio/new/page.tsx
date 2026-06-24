import { GameStudio } from "@/components/parent/games/game-studio";

export default function NewGameStudioPage() {
  // Kid names are vault-decrypted client-side inside GameStudio; the parent
  // layout already gates on auth + an unlocked vault.
  return <GameStudio />;
}
