import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  appReducer,
  initialState,
  type AppState,
  type AppAction,
} from "./app-reducer";
import type { FileSystemProvider } from "@karasu/core";

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  fs: FileSystemProvider;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  fs,
}: {
  children: ReactNode;
  fs: FileSystemProvider;
}) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const value = useMemo(() => ({ state, dispatch, fs }), [state, dispatch, fs]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}
