import { ChangePassword } from "@/components/settings/change-password";
import { ParentPinSettings } from "@/components/settings/parent-pin-settings";

/** Security settings (web: parent/settings/security/page): parent PIN and password. */
export default function SecuritySettingsScreen() {
  return (
    <>
      <ParentPinSettings />
      <ChangePassword />
    </>
  );
}
