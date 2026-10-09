import { useLocalSearchParams } from "expo-router";

import { AccessSettings, type AccessResult } from "@/components/parent/access/access-settings";

const RESULTS: readonly AccessResult[] = ["allowed", "allowedAgent", "declined"];

/**
 * Settings > Access (web: parent/settings/access): everything that can open
 * the family's data. `result` comes back from "Allow access".
 */
export default function AccessSettingsScreen() {
  const { result } = useLocalSearchParams<{ result?: string | string[] }>();
  const value = Array.isArray(result) ? result[0] : result;
  return <AccessSettings key={value ?? ""} result={RESULTS.find((r) => r === value) ?? null} />;
}
