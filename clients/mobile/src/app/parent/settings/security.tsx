import { ChangePassword } from "@/components/settings/change-password";
import { ParentPinSettings } from "@/components/settings/parent-pin-settings";
import { Screen } from "@/components/ui";

/** Security settings (web: parent/settings/security): parent PIN and password. */
export default function SecuritySettingsScreen() {
  return (
    <Screen>
      <ParentPinSettings />
      <ChangePassword />
    </Screen>
  );
}
