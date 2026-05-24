import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUsers, updateUser } from "../api/users";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";

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

  function handleToggle(id: number, currentlyActive: boolean) {
    const action = currentlyActive ? "Deactivate" : "Reactivate";
    if (window.confirm(`${action} this user?`)) {
      toggleMutation.mutate({ id, is_active: !currentlyActive });
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
          <div className="overflow-x-auto rounded-lg bg-white shadow">
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
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.is_active ? "active" : "disabled"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === "admin"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      {currentUser && u.id !== currentUser.id && (
                        <button
                          onClick={() => handleToggle(u.id, u.is_active)}
                          disabled={toggleMutation.isPending}
                          className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${
                            u.is_active
                              ? "bg-red-600 hover:bg-red-700"
                              : "bg-green-600 hover:bg-green-700"
                          }`}
                        >
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
