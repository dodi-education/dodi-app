import { stageSizeStyle } from "@/lib/games/stage";

export default function GamePlayLoading() {
  return (
    <div className="w-full max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-dodi-100" />
          <div className="h-4 w-72 animate-pulse rounded bg-dodi-100" />
        </div>
        <div className="h-9 w-20 animate-pulse rounded-lg bg-dodi-100" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="h-[420px] animate-pulse rounded-[20px] border bg-white shadow-sm" />
        <div className="w-full">
          <div
            style={stageSizeStyle()}
            className="mx-auto animate-pulse rounded-[18px] border bg-white shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
