import type { ReactNode } from "react";

import { ShellNav } from "@/components/layout/shell-nav";
import { getRequestUiContext } from "@/lib/server/request-context";
import { requireAuthenticatedUser } from "@/lib/server/session";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [user, uiContext] = await Promise.all([
    requireAuthenticatedUser(),
    getRequestUiContext(),
  ]);

  return (
    <div className="page-shell px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <ShellNav
          messages={uiContext.messages}
          user={user}
          locale={uiContext.locale}
          themeMode={uiContext.themeMode}
        />
        <main className="space-y-6 pb-8">{children}</main>
      </div>
    </div>
  );
}
