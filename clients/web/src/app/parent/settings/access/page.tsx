import { AccessSettings, type AccessResult } from "@/components/parent/access/access-settings";

const RESULTS: readonly AccessResult[] = ["allowed", "allowedAgent", "declined"];

interface AccessSettingsPageProps {
  /** `?result=` comes back from "Allow access" (/parent/authorize). */
  searchParams: Promise<{ result?: string | string[] }>;
}

export default async function AccessSettingsPage({ searchParams }: AccessSettingsPageProps) {
  const { result } = await searchParams;
  const value = Array.isArray(result) ? result[0] : result;
  const known = RESULTS.find((r) => r === value) ?? null;
  return <AccessSettings result={known} />;
}
