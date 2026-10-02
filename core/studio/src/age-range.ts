/** Inclusive bounds a game's recommended-age range may take (mirrors the API). */
export const AGE_MIN = 1;
export const AGE_MAX = 25;

/** True when a min/max pair is in range and correctly ordered (min ≤ max). */
export function isValidAgeRange(min: number, max: number): boolean {
  return (
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= AGE_MIN &&
    max <= AGE_MAX &&
    min <= max
  );
}
