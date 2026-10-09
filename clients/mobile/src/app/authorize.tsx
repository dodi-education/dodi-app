import { type Href, Redirect, useLocalSearchParams } from "expo-router";

/**
 * The short link robots and the dodi CLI print (`<app>/authorize?code=…`,
 * web: app/authorize): "Allow access" lives in the parent area, which carries
 * the sign-in, vault and PIN gates.
 */
export default function AuthorizeRedirectScreen() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const value = Array.isArray(code) ? code[0] : code;
  const href = value ? `/parent/authorize?code=${encodeURIComponent(value)}` : "/parent/authorize";
  return <Redirect href={href as Href} />;
}
