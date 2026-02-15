import type { RouteObject } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Lists } from "./pages/Lists";
import { ListDetail } from "./pages/ListDetail";
import { Connections } from "./pages/Connections";
import { Collections } from "./pages/Collections";
import { CollectionDetail } from "./pages/CollectionDetail";

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
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "lists", element: <Lists /> },
          { path: "lists/:id", element: <ListDetail /> },
          { path: "connections", element: <Connections /> },
          { path: "collections", element: <Collections /> },
          { path: "collections/:id", element: <CollectionDetail /> },
        ],
      },
    ],
  },
];
