import { UsersTable } from "@/components/admin/users-table";
import { getRequestUiContext } from "@/lib/server/request-context";
import { listUsers } from "@/lib/server/repository";
import { requireAdminUser } from "@/lib/server/session";

export default async function AdminUsersPage() {
  const [adminUser, uiContext, users] = await Promise.all([
    requireAdminUser(),
    getRequestUiContext(),
    listUsers(),
  ]);

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-6 md:p-8">
        <p className="section-label">{uiContext.messages.navAdminUsers}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.05em]">
          {uiContext.messages.adminUsersTitle}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-foreground-muted">
          {uiContext.messages.adminUsersSubtitle}
        </p>
      </section>

      <section className="surface-card rounded-[2rem] p-6">
        <UsersTable
          messages={uiContext.messages}
          initialUsers={users}
          currentUserId={adminUser.uid}
        />
      </section>
    </div>
  );
}
