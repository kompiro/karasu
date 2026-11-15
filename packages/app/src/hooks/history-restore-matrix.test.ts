// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useReducer, useState } from "react";
import { appReducer, initialState, type AppAction, type AppState } from "../state/app-reducer.js";
import type { parseHash } from "./history-hash.js";
import { useHistoryNavigation } from "./useHistoryNavigation.js";

/**
 * Every field a deep link restores, through the cold-boot order that wipes it
 * (TPL-1842): mount with the hash → the hook restores → the seed's
 * `SELECT_FILE` resets the view (`VIEW_RESET`) → the model's index fills in.
 *
 * The table is a `Record` over the fields `parseHash` returns, so a new
 * restorable field does not compile until it has a row here, and the row then
 * has to survive the reset (and be re-applied only once) like every other.
 */

type ParsedHash = NonNullable<ReturnType<typeof parseHash>>;

interface Harness {
  state: AppState;
  orgTree: boolean;
  entityView: boolean;
}

interface Row {
  /** A hash that restores this field (the file it names is the one the seed opens). */
  hash: string;
  /** The field is back in the state the hash names. */
  restored: (h: Harness) => boolean;
  /** The visitor's own navigation away from it. */
  leave: (
    h: Harness & {
      dispatch: (a: AppAction) => void;
      setOrgTree: (v: boolean) => void;
      setEntityView: (v: boolean) => void;
    },
  ) => void;
}

const FILE = "/index.krs";
/** Far more than one boot and one navigation dispatch. */
const MAX_DISPATCHES = 200;
const FILE_QUERY = "?file=%2Findex.krs";

const ROWS: Record<keyof ParsedHash, Row> = {
  activeView: {
    hash: `#krs-deploy${FILE_QUERY}`,
    restored: ({ state }) => state.activeView === "deploy",
    leave: ({ dispatch }) => dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" }),
  },
  nodeId: {
    hash: `#krs-system-A${FILE_QUERY}`,
    restored: ({ state }) => state.viewPath.join("/") === "A",
    leave: ({ dispatch }) => dispatch({ type: "SET_VIEW_PATH", path: [] }),
  },
  highlightNodeId: {
    hash: `#krs-system-root:A${FILE_QUERY}`,
    restored: ({ state }) => state.highlightedNodeId === "A",
    leave: ({ dispatch }) =>
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null, highlightAttribute: "data-node-id" }),
  },
  // The two sub-modes live in component state the hook is handed, not in the
  // reducer, so `VIEW_RESET` cannot wipe them; their rows hold that.
  isOrgTreeView: {
    hash: `#krs-org-tree${FILE_QUERY}`,
    restored: ({ state, orgTree }) => state.activeView === "org" && orgTree,
    leave: ({ setOrgTree }) => setOrgTree(false),
  },
  isEntityView: {
    hash: `#krs-entity-A${FILE_QUERY}`,
    restored: ({ state, entityView }) => state.viewPath.join("/") === "A" && entityView,
    leave: ({ setEntityView, dispatch }) => {
      setEntityView(false);
      dispatch({ type: "SET_VIEW_PATH", path: [] });
    },
  },
  filePath: {
    hash: `#krs-system-root${FILE_QUERY}`,
    restored: ({ state }) => state.currentFilePath === FILE,
    leave: ({ dispatch }) =>
      dispatch({ type: "SELECT_FILE", path: "/other.krs", content: "system S {}\n" }),
  },
};

/**
 * The hook on the real reducer, with a node-path index that stays empty until
 * `fillIndex()` (a model compiled a render after the seed), and the two
 * sub-mode flags as the component state the app hands it.
 */
function boot() {
  let generation = 0;
  let dispatches = 0;
  const hook = renderHook(() => {
    const [state, rawDispatch] = useReducer(appReducer, initialState);
    // A restoration that is re-applied on every render dispatches forever; cap
    // it so that fails here instead of hanging the run.
    const dispatch = (action: AppAction) => {
      if (++dispatches > MAX_DISPATCHES) throw new Error(`dispatch loop (last: ${action.type})`);
      rawDispatch(action);
    };
    const [orgTree, setOrgTree] = useState(false);
    const [entityView, setEntityView] = useState(false);
    const nodePathIndex =
      state.fileContent && generation > 0
        ? new Map(Array.from({ length: generation }, (_, i) => [i === 0 ? "A" : `N${i}`, ["A"]]))
        : new Map<string, string[]>();
    useHistoryNavigation({
      activeView: state.activeView,
      viewPath: state.viewPath,
      currentFilePath: state.currentFilePath,
      nodePathIndex,
      dispatch,
      isOrgTreeView: orgTree,
      setIsOrgTreeView: setOrgTree,
      isEntityView: entityView,
      setIsEntityView: setEntityView,
      highlightedNodeId: state.highlightedNodeId,
    });
    return { state, dispatch, orgTree, entityView, setOrgTree, setEntityView };
  });
  return {
    ...hook,
    /** The model's index fills in (again, with a new entry, on later calls). */
    fillIndex: () => {
      generation++;
    },
  };
}

describe.each(Object.keys(ROWS) as (keyof ParsedHash)[])(
  "restoring %s from a deep link",
  (field) => {
    const row = ROWS[field];

    beforeEach(() => {
      history.replaceState(null, "", row.hash);
    });

    afterEach(() => {
      cleanup();
      history.replaceState(null, "", "/");
    });

    async function bootPastTheReset() {
      const h = boot();
      await act(async () => {
        h.result.current.dispatch({
          type: "SELECT_FILE",
          path: FILE,
          content: "system S {\n  service A {}\n}\n",
        });
      });
      // The seed reset has run with the index still empty; nothing is re-applied yet.
      h.fillIndex();
      await act(async () => {
        h.rerender();
      });
      return h;
    }

    it("survives the seed's view reset", async () => {
      const h = await bootPastTheReset();
      expect(row.restored(h.result.current)).toBe(true);
    });

    it("is re-applied once, not again when the index changes later", async () => {
      const h = await bootPastTheReset();
      await act(async () => {
        row.leave(h.result.current);
      });
      expect(row.restored(h.result.current)).toBe(false);
      h.fillIndex();
      await act(async () => {
        h.rerender();
      });
      expect(row.restored(h.result.current)).toBe(false);
    });
  },
);
