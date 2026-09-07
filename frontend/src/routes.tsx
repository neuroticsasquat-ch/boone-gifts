import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Lists } from "./pages/Lists";
import { CreateList } from "./pages/CreateList";
import { ListDetail } from "./pages/ListDetail";
import { People } from "./pages/People";
import { ConnectionProfile } from "./pages/ConnectionProfile";
import { FamilyDetail } from "./pages/FamilyDetail";
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
          { path: "lists/:id", element: <ListDetail /> },
          { path: "people", element: <People /> },
          { path: "people/families/:id", element: <FamilyDetail /> },
          { path: "people/:id", element: <ConnectionProfile /> },
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
