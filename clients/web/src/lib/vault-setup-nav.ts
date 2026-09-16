/**
 * Where the account-key step (/vault-setup) should send the browser on its own,
 * extracted from the page so the rule is testable.
 *
 * Continuing CLEARS the pending key (it must not linger in memory), so "no key"
 * alone cannot mean "nothing to show here": once the parent has pressed
 * Continue, the step owns the navigation and this guard must stay out of the
 * way, or it races the step and wins.
 */
export function vaultSetupGuardTarget(state: {
  /** A freshly generated key is waiting to be shown. */
  hasPendingKey: boolean;
  /** The parent pressed Continue; the step is navigating on by itself. */
  hasContinued: boolean;
}): string | null {
  if (state.hasContinued || state.hasPendingKey) return null;
  return "/parent/dashboard";
}
