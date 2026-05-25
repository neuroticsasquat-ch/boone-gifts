import type { RouteObject } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Lists } from "./pages/Lists";
import { CreateList } from "./pages/CreateList";
import { ListDetail } from "./pages/ListDetail";
import { Connections } from "./pages/Connections";
import { ConnectionProfile } from "./pages/ConnectionProfile";
import { Collections } from "./pages/Collections";
import { CollectionDetail } from "./pages/CollectionDetail";
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
      {
        element: <Layout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "lists", element: <Lists /> },
          { path: "lists/new", element: <CreateList /> },
          { path: "lists/:id", element: <ListDetail /> },
          { path: "connections", element: <Connections /> },
          { path: "connections/:id", element: <ConnectionProfile /> },
          { path: "collections", element: <Collections /> },
          { path: "collections/:id", element: <CollectionDetail /> },
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
