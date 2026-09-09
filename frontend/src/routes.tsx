import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { NumericId } from "./components/NumericId";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Lists } from "./pages/Lists";
import { ListsArchive } from "./pages/ListsArchive";
import { CreateList } from "./pages/CreateList";
import { ListDetail } from "./pages/ListDetail";
import { People } from "./pages/People";
import { ConnectionProfile } from "./pages/ConnectionProfile";
import { FamilyDetail } from "./pages/FamilyDetail";
import { FamilyArchive } from "./pages/FamilyArchive";
import { FolderDetail } from "./pages/FolderDetail";
import { OccasionDetail } from "./pages/OccasionDetail";
import { AcceptFamilyInvite } from "./pages/AcceptFamilyInvite";
import { Account } from "./pages/Account";
import { AdminInvites } from "./pages/AdminInvites";
import { AdminUsers } from "./pages/AdminUsers";

export const routes: RouteObject[] = [
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/register",
    element: <Register />,
  },
  {
    path: "/forgot-password",
    element: <ForgotPassword />,
  },
  {
    path: "/reset-password",
    element: <ResetPassword />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      // Not a shim for the retired Dashboard — `/` is where a returning user
      // with a live session lands when they open the bare domain, so it has to
      // go somewhere. Post-login landing is `/lists`.
      { index: true, element: <Navigate to="/lists" replace /> },
      { path: "family-invites/:token", element: <AcceptFamilyInvite /> },
      {
        element: <Layout />,
        children: [
          { path: "lists", element: <Lists /> },
          { path: "lists/new", element: <CreateList /> },
          // Archived lists and folders have one way in, and it is this page —
          // the dashboard no longer has an archived state to be put into
          // (NEU-1278). A static segment outranks `lists/:id`, the same way
          // `lists/new` already does.
          { path: "lists/archive", element: <ListsArchive /> },
          { path: "lists/:id", element: <NumericId back="/lists"><ListDetail /></NumericId> },
          { path: "people", element: <People /> },
          { path: "people/families/:id", element: <NumericId back="/people"><FamilyDetail /></NumericId> },
          // The same for a family's archived occasions, reached from the
          // occasions section on the family page.
          { path: "people/families/:id/archive", element: <NumericId back="/people"><FamilyArchive /></NumericId> },
          { path: "people/:id", element: <NumericId back="/people"><ConnectionProfile /></NumericId> },
          { path: "occasions/:id", element: <NumericId back="/people"><OccasionDetail /></NumericId> },
          // A folder page, but no folder *index*: the folder filter on /lists is
          // where a user meets the concept, and NEU-1277's Group by is what
          // links here. `Folders.tsx` stays unrouted.
          { path: "folders/:id", element: <NumericId back="/lists"><FolderDetail /></NumericId> },
          { path: "account", element: <Account /> },
          {
            path: "admin",
            element: <AdminRoute />,
            children: [
              { index: true, element: <div>Admin Dashboard</div> },
              { path: "invites", element: <AdminInvites /> },
              { path: "users", element: <AdminUsers /> },
            ],
          },
        ],
      },
    ],
  },
];
