import { createContext, type ReactNode, use } from "react";
import type { DashboardApi } from "./api.js";

const DashboardApiContext = createContext<DashboardApi | null>(null);

export function DashboardApiProvider({ api, children }: { api: DashboardApi; children: ReactNode }) {
  return <DashboardApiContext value={api}>{children}</DashboardApiContext>;
}

export function useDashboardApi(): DashboardApi {
  const api = use(DashboardApiContext);
  if (!api) throw new Error("DashboardApiProvider is missing");
  return api;
}
