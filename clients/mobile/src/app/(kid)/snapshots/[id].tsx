import { useLocalSearchParams } from "expo-router";

import { SnapshotPlayPage } from "@/components/snapshots/snapshot-play-page";

/** Replay a saved snapshot (web: app/(kid)/snapshots/[id]/page). */
export default function KidSnapshotPlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SnapshotPlayPage key={id} snapshotId={id} />;
}
