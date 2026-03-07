export default function KidLoading() {
  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <div className="h-48 w-48 animate-pulse rounded-full bg-dodi-100" />
      <div className="h-6 w-32 animate-pulse rounded-lg bg-dodi-100" />
      <div className="h-24 w-full max-w-xs animate-pulse rounded-2xl bg-dodi-100" />
    </div>
  );
}
