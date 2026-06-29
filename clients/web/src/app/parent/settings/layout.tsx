import { SettingsSidebar } from "@/components/parent/settings-sidebar";

/**
 * Settings area: a dedicated sub-navigation that overlaps the main sidebar.
 * The rail is fixed (wide) / a tab strip (compact); section pages render in the
 * normal content area as `children`.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SettingsSidebar />
      {children}
    </>
  );
}
