export default function GamesLoading() {
  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-dodi-100" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-dodi-100" />
      </div>
      <div className="flex gap-3">
        <div className="h-10 w-48 animate-pulse rounded-full bg-dodi-100" />
        <div className="h-10 w-32 animate-pulse rounded-full bg-dodi-100" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-[20px] bg-white shadow-[0_2px_10px_rgba(34,56,78,0.05)]"
          />
        ))}
      </div>
    </div>
  );
}
