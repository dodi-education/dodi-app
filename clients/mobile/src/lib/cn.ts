import { twMerge } from "tailwind-merge";

/** Join class names (later ones win on conflicts), like the web's `cn`. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
