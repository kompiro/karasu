import { useState } from "react";
import { useClipboardCopy } from "./useClipboardCopy.js";
import { buildShareUrls } from "../utils/inline-share.js";
import type { SharePayload, ShareTarget } from "../utils/inline-share.js";
import type { ActiveView } from "../state/app-reducer.js";

/** Props to spread directly onto `<ShareDialog />` — matches `ShareDialogProps`. */
interface ShareDialogRenderProps {
  open: boolean;
  fragmentUrl: string | null;
  unfurlUrl: string | null;
  copiedUrl: string | null;
  canIncludeTarget: boolean;
  includeTarget: boolean;
  onIncludeTargetChange: (next: boolean) => void;
  onCopy: (url: string) => void;
  onClose: () => void;
}

interface UseShareDialogParams {
  activeView: ActiveView;
  /** Active-view slice's current drill path (`view.viewPath`). */
  viewPath: string[];
  /** Active-view slice's highlighted node, if any (`view.highlightedNodeId`). */
  highlightedNodeId?: string | null;
  isOrgTreeViewOpen: boolean;
  isEntityViewOpen: boolean;
  hasEntityView: boolean;
  /** Flattens the current project into a share payload; undefined when sharing isn't wired up. */
  getShareBundle: (() => Promise<SharePayload>) | undefined;
}

/**
 * Owns the Share dialog's state + handlers (#2015 point 10), extracted from
 * `PreviewColumn`: flattening the project into a {@link SharePayload}, building
 * the fragment/unfurl URLs, tracking the "copied" feedback, and the deep
 * permalink "include current view position" checkbox (#1827). The cluster's
 * only external inputs are `activeView`, the active-view slice's `viewPath` /
 * `highlightedNodeId`, two context booleans, and `getShareBundle` — it has no
 * dependency on the rest of `PreviewColumn`.
 */
export function useShareDialog({
  activeView,
  viewPath,
  highlightedNodeId,
  isOrgTreeViewOpen,
  isEntityViewOpen,
  hasEntityView,
  getShareBundle,
}: UseShareDialogParams): {
  shareOpen: boolean;
  handleShare: () => Promise<void>;
  shareDialogProps: ShareDialogRenderProps;
} {
  // Share (karasu-nest inline URL sharing). The Share button opens the dialog
  // immediately (preserving the click gesture), flattens the project into a
  // share payload — async because multi-file projects resolve from fs — then
  // builds the URL and copies it eagerly. `copied` reflects the real clipboard
  // result; the dialog's Copy button is the reliable cross-browser fallback.
  const { copy: copyShareUrl, copied: shareCopied } = useClipboardCopy();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFragmentUrl, setShareFragmentUrl] = useState<string | null>(null);
  const [shareUnfurlUrl, setShareUnfurlUrl] = useState<string | null>(null);
  const [copiedShareUrl, setCopiedShareUrl] = useState<string | null>(null);
  // The flattened bundle + the deep permalink target captured at share time, so
  // the "link to current view" checkbox can re-encode without re-flattening.
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [includeTarget, setIncludeTarget] = useState(false);

  function copyShare(url: string) {
    setCopiedShareUrl(url);
    copyShareUrl(url);
  }

  /**
   * Deep permalink target for the *current* view position (#1827), or `null`
   * when the user is at the plain whole-model root (system view, not drilled,
   * nothing highlighted) — there is nothing to deep-link to in that case.
   */
  function currentShareTarget(): ShareTarget | null {
    const path = viewPath;
    // Only the drillable views (system/org) encode a leaf node in the hash;
    // deploy/matrix are single-level, so a node there would be dropped on
    // decode (buildHash) — don't put it in the payload.
    const drillable = activeView === "system" || activeView === "org";
    const node = drillable && path.length > 0 ? path[path.length - 1] : undefined;
    const highlight = highlightedNodeId;
    const orgTree = activeView === "org" && isOrgTreeViewOpen;
    // Entity sub-mode only encodes when a domain is actually drilled and it has
    // an entity view to show (mirrors the toggle-visibility gate below).
    const entityView = activeView === "system" && isEntityViewOpen && hasEntityView && !!node;
    const hasPosition = activeView !== "system" || !!node || !!highlight || orgTree || entityView;
    if (!hasPosition) return null;
    const target: ShareTarget = { view: activeView };
    if (node) target.node = node;
    if (highlight) target.highlight = highlight;
    if (orgTree) target.orgTree = true;
    if (entityView) target.entityView = true;
    return target;
  }

  /** Build + show both URLs for `payload`, optionally embedding `target`. */
  function applyShareUrls(
    payload: SharePayload,
    target: ShareTarget | null,
    include: boolean,
  ): string {
    const finalPayload = include && target ? { ...payload, target } : payload;
    const { fragmentUrl, unfurlUrl } = buildShareUrls(finalPayload, window.location);
    setShareFragmentUrl(fragmentUrl);
    setShareUnfurlUrl(unfurlUrl);
    return fragmentUrl;
  }

  async function handleShare() {
    if (!getShareBundle) return;
    setShareFragmentUrl(null); // generating
    setShareUnfurlUrl(null);
    setCopiedShareUrl(null);
    setShareOpen(true);
    const payload = await getShareBundle();
    const target = currentShareTarget();
    // Default the checkbox ON whenever there is a position worth linking to.
    const include = target !== null;
    setSharePayload(payload);
    setShareTarget(target);
    setIncludeTarget(include);
    const fragmentUrl = applyShareUrls(payload, target, include);
    // Eagerly copy the private link (the default), preserving the click gesture.
    copyShare(fragmentUrl);
  }

  // Toggling the checkbox re-encodes from the captured bundle (no re-flatten).
  // Does not re-copy — the user copies the regenerated URL via the Copy button.
  function handleIncludeTargetChange(next: boolean) {
    setIncludeTarget(next);
    if (sharePayload) applyShareUrls(sharePayload, shareTarget, next);
  }

  return {
    shareOpen,
    handleShare,
    shareDialogProps: {
      open: shareOpen,
      fragmentUrl: shareFragmentUrl,
      unfurlUrl: shareUnfurlUrl,
      copiedUrl: shareCopied ? copiedShareUrl : null,
      canIncludeTarget: shareTarget !== null,
      includeTarget,
      onIncludeTargetChange: handleIncludeTargetChange,
      onCopy: copyShare,
      onClose: () => setShareOpen(false),
    },
  };
}
