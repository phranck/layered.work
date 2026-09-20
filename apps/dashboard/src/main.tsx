import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { createDashboardApi } from "./api.js";
import { expirationLoginLocation } from "./auth-routing.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { createDashboardBrowserRouter } from "./router.js";
import "./app.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let router: ReturnType<typeof createDashboardBrowserRouter>;
const api = createDashboardApi(queryClient, () => {
  const destination = expirationLoginLocation(router.state.location);
  if (destination) void router.navigate(destination, { replace: true });
});
router = createDashboardBrowserRouter({ api, queryClient });

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DashboardApiProvider api={api}>
        <RouterProvider router={router} />
      </DashboardApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
