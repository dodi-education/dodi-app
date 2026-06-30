import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Image
          src="/images/dodi-head-active.png"
          alt="dodi"
          width={48}
          height={48}
        />
        <span className="text-2xl font-bold text-dodi-800">dodi</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
