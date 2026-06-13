import type { Project, DirEntry, DisplayMode } from "@karasu-tools/core";
import type { CompareSource } from "../fs/compare-source";

export type ActiveView = "system" | "deploy" | "org" | "matrix";

export interface AppState {
  // プロジェクト管理
  currentProject: Project | null;
  projects: Project[];
  // ファイル管理
  currentFilePath: string | null;
  fileContent: string;
  fileTree: DirEntry[];
  /**
   * Last `.krs` file the user opened (Issue #811). Used as the preview entry
   * so that opening a non-`.krs` file (e.g. `.krs.style`, `.md`) does not blank
   * out the diagram. Null until the user opens any `.krs`; reset on project switch.
   */
  lastKrsFilePath: string | null;
  // ビュー
  viewPath: string[];
  activeView: ActiveView;
  selectedDeployBlockId: string | null;
  // クロスナビゲーション
  highlightedNodeId: string | null;
  // UI
  displayMode: DisplayMode;
  isAllLayersOpen: boolean;
  loading: boolean;
  /**
   * Set when ProjectMode bootstrap fails (e.g. OPFS unavailable in private
   * browsing, quota exceeded, corrupt project metadata). Surfaces an error
   * screen instead of an indefinite "Loading…" hang (#1530).
   */
  initError: string | null;
  /**
   * Source to compare the current file against in diff mode
   * (Issue #650 file source, #739 pasted source, #740 snapshot source).
   * When non-null, diff views render a graphical diff between the current entry
   * path and the resolved content of this source.
   */
  compareSource: CompareSource | null;
  /**
   * When true, the diff direction is flipped (Issue #765 part A): the compare
   * source acts as the after-side and the project entry as the before-side.
   * Auto-resets to `false` whenever the compare source or project changes.
   */
  diffSwapped: boolean;
}

export const initialState: AppState = {
  currentProject: null,
  projects: [],
  currentFilePath: null,
  fileContent: "",
  fileTree: [],
  lastKrsFilePath: null,
  viewPath: [],
  activeView: "system",
  selectedDeployBlockId: null,
  highlightedNodeId: null,
  displayMode: "shape",
  isAllLayersOpen: false,
  loading: true,
  initError: null,
  compareSource: null,
  diffSwapped: false,
};

/**
 * `.krs` files only — `.krs.style` and other extensions are excluded so opening
 * a stylesheet does not change the preview root (Issue #811).
 */
function isKrsFile(path: string): boolean {
  return path.endsWith(".krs");
}

export type AppAction =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SET_CURRENT_PROJECT"; project: Project }
  | { type: "SELECT_FILE"; path: string; content: string }
  | { type: "UPDATE_FILE_CONTENT"; content: string }
  | { type: "SET_FILE_TREE"; tree: DirEntry[] }
  | { type: "SET_VIEW_PATH"; path: string[] }
  | { type: "SET_ACTIVE_VIEW"; activeView: ActiveView; highlightNodeId?: string | null }
  | { type: "SET_HIGHLIGHTED_NODE"; nodeId: string | null }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_INIT_ERROR"; error: string | null }
  | { type: "SET_SELECTED_DEPLOY_BLOCK"; id: string | null }
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "REMOVE_PROJECT"; id: string }
  | { type: "RENAME_PROJECT"; id: string; name: string }
  | { type: "SET_DISPLAY_MODE"; displayMode: DisplayMode }
  | { type: "SET_ALL_LAYERS_OPEN"; isAllLayersOpen: boolean }
  | { type: "SET_COMPARE_SOURCE"; source: CompareSource | null }
  | { type: "TOGGLE_DIFF_SWAPPED" };

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
        lastKrsFilePath: null,
        viewPath: [],
        activeView: "system",
        selectedDeployBlockId: null,
        highlightedNodeId: null,
        compareSource: null,
        diffSwapped: false,
      };

    case "SELECT_FILE":
      return {
        ...state,
        currentFilePath: action.path,
        fileContent: action.content,
        lastKrsFilePath:
          action.path === "" ? null : isKrsFile(action.path) ? action.path : state.lastKrsFilePath,
        viewPath: [],
        activeView: "system",
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
        highlightedNodeId: action.highlightNodeId ?? null,
      };

    case "SET_HIGHLIGHTED_NODE":
      return { ...state, highlightedNodeId: action.nodeId };

    case "SET_LOADING":
      return { ...state, loading: action.loading };

    case "SET_INIT_ERROR":
      return { ...state, initError: action.error };

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

    case "SET_ALL_LAYERS_OPEN":
      return { ...state, isAllLayersOpen: action.isAllLayersOpen };

    case "SET_COMPARE_SOURCE":
      return { ...state, compareSource: action.source, diffSwapped: false };

    case "TOGGLE_DIFF_SWAPPED":
      return state.compareSource ? { ...state, diffSwapped: !state.diffSwapped } : state;

    default:
      return state;
  }
}
