/**
 * React binding for the shared vanilla stores: the same shape `zustand`'s
 * `create` returns (a selector hook that also carries getState / setState /
 * subscribe), so client code reads `useKidStore(selector)` and
 * `useKidStore.getState()` alike on web and mobile.
 */
import { useStore, type StoreApi, type UseBoundStore } from "zustand";

export function bindStore<S>(api: StoreApi<S>): UseBoundStore<StoreApi<S>> {
  const useBoundStore = (<T>(selector?: (state: S) => T) =>
    useStore(api, selector as (state: S) => T)) as UseBoundStore<StoreApi<S>>;
  return Object.assign(useBoundStore, api);
}
