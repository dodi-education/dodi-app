import { ChangePassword } from "@/components/parent/change-password";
import { ParentPinSettings } from "@/components/parent/parent-pin-settings";

export default function SecuritySettingsPage() {
  return (
    <>
      <ParentPinSettings />
      <ChangePassword />
    </>
  );
}
