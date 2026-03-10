export function getDodiImage(connected: boolean, micActive: boolean, head: boolean): string {
  if (!connected) return head ? "/images/dodi_head_sleep.png" : "/images/dodi_sleep.png";
  if (!micActive) return head ? "/images/dodi_head_deaf.png" : "/images/dodi_deaf.png";
  return head ? "/images/dodi-head.png" : "/images/dodi-full.png";
}
