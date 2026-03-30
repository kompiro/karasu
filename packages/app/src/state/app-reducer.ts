import type { Project, DirEntry, DisplayMode } from "@karasu/core";

export type ActiveView = "system" | "deploy" | "org";

export interface AppState {
  // プロジェクト管理
  currentProject: Project | null;
  projects: Project[];
  // ファイル管理
  currentFilePath: string | null;
  fileContent: string;
  fileTree: DirEntry[];
  // ビュー
  viewPath: string[];
  activeView: ActiveView;
  orgPath: string[];
  selectedDeployBlockId: string | null;
  // クロスナビゲーション
  highlightedNodeId: string | null;
  // UI
  displayMode: DisplayMode;
  isFullView: boolean;
  loading: boolean;
}

export const initialState: AppState = {
  currentProject: null,
  projects: [],
  currentFilePath: null,
  fileContent: "",
  fileTree: [],
  viewPath: [],
  activeView: "system",
  orgPath: [],
  selectedDeployBlockId: null,
  highlightedNodeId: null,
  displayMode: "shape",
  isFullView: false,
  loading: true,
};

export type AppAction =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SET_CURRENT_PROJECT"; project: Project }
  | { type: "SELECT_FILE"; path: string; content: string }
  | { type: "UPDATE_FILE_CONTENT"; content: string }
  | { type: "SET_FILE_TREE"; tree: DirEntry[] }
  | { type: "SET_VIEW_PATH"; path: string[] }
  | { type: "SET_ACTIVE_VIEW"; activeView: ActiveView }
  | { type: "SET_HIGHLIGHTED_NODE"; nodeId: string | null }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ORG_PATH"; path: string[] }
  | { type: "SET_SELECTED_DEPLOY_BLOCK"; id: string | null }
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "REMOVE_PROJECT"; id: string }
  | { type: "RENAME_PROJECT"; id: string; name: string }
  | { type: "SET_DISPLAY_MODE"; displayMode: DisplayMode }
  | { type: "SET_FULL_VIEW"; isFullView: boolean };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PROJECTS":
      return { ...state, projects: action.projects };

    case "SET_CURRENT_PROJECT":
      return {
        ...state,
        currentProject: action.project,
        currentFilePath: null,
        fileContent: "",
        fileTree: [],
        viewPath: [],
        activeView: "system",
        orgPath: [],
        selectedDeployBlockId: null,
        highlightedNodeId: null,
      };

    case "SELECT_FILE":
      return {
        ...state,
        currentFilePath: action.path,
        fileContent: action.content,
        viewPath: [],
        activeView: "system",
        orgPath: [],
        selectedDeployBlockId: null,
        highlightedNodeId: null,
      };

    case "UPDATE_FILE_CONTENT":
      return { ...state, fileContent: action.content };

    case "SET_FILE_TREE":
      return { ...state, fileTree: action.tree };

    case "SET_VIEW_PATH":
      return { ...state, viewPath: action.path };

    case "SET_ACTIVE_VIEW":
      return {
        ...state,
        activeView: action.activeView,
        viewPath: [],
        highlightedNodeId: null,
        ...(action.activeView === "org" ? { orgPath: [] } : {}),
      };

    case "SET_HIGHLIGHTED_NODE":
      return { ...state, highlightedNodeId: action.nodeId };

    case "SET_LOADING":
      return { ...state, loading: action.loading };

    case "SET_ORG_PATH":
      return { ...state, orgPath: action.path };

    case "SET_SELECTED_DEPLOY_BLOCK":
      return { ...state, selectedDeployBlockId: action.id };

    case "ADD_PROJECT":
      return {
        ...state,
        projects: [...state.projects, action.project],
      };

    case "REMOVE_PROJECT":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        currentProject: state.currentProject?.id === action.id ? null : state.currentProject,
      };

    case "RENAME_PROJECT":
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)),
        currentProject:
          state.currentProject?.id === action.id
            ? { ...state.currentProject, name: action.name }
            : state.currentProject,
      };

    case "SET_DISPLAY_MODE":
      return { ...state, displayMode: action.displayMode };

    case "SET_FULL_VIEW":
      return { ...state, isFullView: action.isFullView };

    default:
      return state;
  }
}
