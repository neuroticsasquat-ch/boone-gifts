import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUser, getUsers, updateUser } from "../api/users";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import type { User } from "../types";

export function AdminUsers() {
  useTitle("Users");
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const users = useQuery({ queryKey: ["admin-users"], queryFn: getUsers });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updateUser(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Failed to update user."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User deleted.");
    },
    onError: () => toast.error("Failed to delete user."),
  });

  function handleToggle(id: number, currentlyActive: boolean) {
    const action = currentlyActive ? "Deactivate" : "Reactivate";
    if (window.confirm(`${action} this user?`)) {
      toggleMutation.mutate({ id, is_active: !currentlyActive });
    }
  }

  function handleDelete(id: number, name: string) {
    if (window.confirm(`Permanently delete ${name} and all their data? This cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Users</h1>

      <section>
        {users.data && users.data.length === 0 && (
          <p className="text-gray-500">No users found.</p>
        )}
        {users.data && users.data.length > 0 && (
          <>
            {/* Mobile: card list */}
            <ul className="space-y-3 md:hidden">
              {users.data.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  isSelf={currentUser?.id === u.id}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  isPending={toggleMutation.isPending || deleteMutation.isPending}
                />
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto rounded-lg bg-white shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Registered</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.data.map((u) => (
                    <tr key={u.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{u.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{u.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <StatusBadge isActive={u.is_active} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        {currentUser && u.id !== currentUser.id && (
                          <div className="flex justify-end gap-2">
                            <ToggleButton
                              isActive={u.is_active}
                              isPending={toggleMutation.isPending}
                              onClick={() => handleToggle(u.id, u.is_active)}
                            />
                            <button
                              onClick={() => handleDelete(u.id, u.name)}
                              disabled={deleteMutation.isPending}
                              className="rounded bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function UserCard({
  user,
  isSelf,
  onToggle,
  onDelete,
  isPending,
}: {
  user: User;
  isSelf: boolean;
  onToggle: (id: number, isActive: boolean) => void;
  onDelete: (id: number, name: string) => void;
  isPending: boolean;
}) {
  return (
    <li className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{user.name}</p>
          <p className="text-sm text-gray-500 truncate">{user.email}</p>
          <p className="mt-1 text-xs text-gray-400">
            Joined {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <div className="flex gap-1.5">
            <StatusBadge isActive={user.is_active} />
            <RoleBadge role={user.role} />
          </div>
        </div>
      </div>
      {!isSelf && (
        <div className="mt-3 flex justify-end gap-2">
          <ToggleButton
            isActive={user.is_active}
            isPending={isPending}
            onClick={() => onToggle(user.id, user.is_active)}
          />
          <button
            onClick={() => onDelete(user.id, user.name)}
            disabled={isPending}
            className="rounded bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {isActive ? "active" : "disabled"}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        role === "admin" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-600"
      }`}
    >
      {role}
    </span>
  );
}

function ToggleButton({
  isActive,
  isPending,
  onClick,
}: {
  isActive: boolean;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isPending}
      className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${
        isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
      }`}
    >
      {isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}
