import { createContext, useContext } from "react";

interface SidebarCollapseState {
  collapsed: boolean;
  toggle: () => void;
}

export const SidebarCollapseContext = createContext<SidebarCollapseState | null>(null);

export function useSidebarCollapse(): SidebarCollapseState | null {
  return useContext(SidebarCollapseContext);
}
