"use client";

import type { ApiResult, UserDocument, UserRole, UserStatus } from "@zootopia/shared-types";
import { useState } from "react";

import type { AppMessages } from "@/lib/messages";

type UsersTableProps = {
  messages: AppMessages;
  initialUsers: UserDocument[];
  currentUserId: string;
};

export function UsersTable({
  messages,
  initialUsers,
  currentUserId,
}: UsersTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function patchUser(
    uid: string,
    path: "role" | "status",
    payload: { role?: UserRole; status?: UserStatus },
  ) {
    setBusyUserId(uid);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${uid}/${path}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as ApiResult<{ user: UserDocument }>;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "USER_UPDATE_FAILED" : body.error.message);
      }

      setUsers((current) =>
        current.map((user) => (user.uid === uid ? body.data.user : user)),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "User update failed.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="table-shell">
        <table className="bg-background-strong">
          <thead>
            <tr>
              <th>{messages.tableUser}</th>
              <th>{messages.tableRole}</th>
              <th>{messages.tableStatus}</th>
              <th>{messages.adminActionsTitle}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">{messages.noUsers}</div>
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const locked = user.uid === currentUserId;
                const pending = busyUserId === user.uid;

                return (
                  <tr key={user.uid}>
                    <td>
                      <p className="font-semibold text-foreground">
                        {user.fullName || user.displayName || user.email || user.uid}
                      </p>
                      <p className="mt-1 text-sm text-foreground-muted">
                        {user.email || user.uid}
                      </p>
                    </td>
                    <td>
                      <span className="chip">
                        {user.role === "admin" ? messages.roleAdmin : messages.roleUser}
                      </span>
                    </td>
                    <td>
                      <span className="chip">
                        {user.status === "active"
                          ? messages.statusActive
                          : messages.statusSuspended}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pending || locked}
                          onClick={() =>
                            void patchUser(user.uid, "role", {
                              role: user.role === "admin" ? "user" : "admin",
                            })
                          }
                          className="secondary-button px-4 py-2 text-sm"
                        >
                          {messages.adminRoleAction}
                        </button>
                        <button
                          type="button"
                          disabled={pending || locked}
                          onClick={() =>
                            void patchUser(user.uid, "status", {
                              status: user.status === "active" ? "suspended" : "active",
                            })
                          }
                          className="danger-button px-4 py-2 text-sm"
                        >
                          {messages.adminStatusAction}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
