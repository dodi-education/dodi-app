import { useLocalSearchParams } from "expo-router";

import { AuthorizeAccess } from "@/components/parent/access/authorize-access";
import { ShellContent } from "@/components/shared/shell-content";

/**
 * "Allow access" for a robot or agent (web: parent/authorize). The link a
 * robot or `dodi login` prints arrives with its `code` route param; the parent
 * layout's vault and PIN gates apply.
 */
export default function AuthorizeScreen() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const value = (Array.isArray(code) ? code[0] : code) ?? "";
  return (
    <ShellContent>
      <AuthorizeAccess key={value} code={value} />
    </ShellContent>
  );
}
