import * as Sentry from "@sentry/react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { TestErrorTrigger } from "./components/TestErrorTrigger";
import { AuthProvider } from "./contexts/AuthContext";
import { routes } from "./routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
    },
  },
});

const router = createBrowserRouter(routes);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
          <TestErrorTrigger />
          <RouterProvider router={router} />
          <Toaster position="bottom-center" toastOptions={{ duration: 4000 }} />
        </Sentry.ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
