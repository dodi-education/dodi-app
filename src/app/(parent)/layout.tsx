import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Header } from "@/components/shared/header";
import { BottomNav, SidebarNav } from "@/components/shared/sidebar-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/images/dodi-head.png"
              alt="Dodi"
              width={28}
              height={28}
            />
            <span className="font-bold text-dodi-800">Dodi</span>
          </Link>
        </div>
        <div className="flex-1 p-4">
          <SidebarNav />
        </div>
        <div className="border-t p-4 text-xs text-muted-foreground">
          {user.email}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6">{children}</main>
        {/* Mobile bottom nav */}
        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
