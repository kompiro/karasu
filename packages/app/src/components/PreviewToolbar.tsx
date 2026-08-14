import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { usePreview } from "../state/preview-context.js";
import { useTranslation } from "../i18n/index.js";
import { openReferenceWindow } from "../utils/open-reference-window.js";

// The published documentation site (GitHub Pages). Reached from the Preview
// toolbar's Docs dropdown, alongside the in-app Reference pop-out. Starlight
// serves the Japanese docs under the `/ja/` locale prefix, so the link follows
// the active app locale.
const DOCS_SITE_BASE_URL = "https://kompiro.github.io/karasu/";
const docsSiteUrl = (locale: string) =>
  locale === "ja" ? `${DOCS_SITE_BASE_URL}ja/` : DOCS_SITE_BASE_URL;

export interface PreviewToolbarProps {
  exportAvailable: boolean;
  drillDownAvailable: boolean;
  allViewsAvailable: boolean;
  shareAvailable: boolean;
  onExport: () => void;
  onExportDrillDown: () => void;
  onExportAllDiagrams: () => void;
  onExportDrawio: () => void;
  onOpenAllViews: () => void;
  onShare: () => void;
}

/**
 * The controls that take the diagram somewhere else — files, links, docs — plus
 * the focus toggle (#2317).
 *
 * The controls that *change* the diagram live on `PreviewCanvasControls`, over
 * the canvas. Splitting them is what keeps this strip to a single row: with
 * both families here it wrapped to two rows at every width measured between
 * 960px and 1680px, in both locales.
 *
 * Three named controls rather than one catch-all menu, so what a menu holds can
 * be predicted before opening it: the export button owns everything that writes
 * a file, Share owns links, Docs owns reading material.
 */
export function PreviewToolbar({
  exportAvailable,
  drillDownAvailable,
  allViewsAvailable,
  shareAvailable,
  onExport,
  onExportDrillDown,
  onExportAllDiagrams,
  onExportDrawio,
  onOpenAllViews,
  onShare,
}: PreviewToolbarProps) {
  const { activeView, previewFocused, onPreviewFocusToggle, onExportDrawio: drawio } = usePreview();
  const { t, locale } = useTranslation();

  return (
    <>
      {/* Split export button: left = export the current diagram, right = the
          rest of the ways to write it out. "Open All Views" is in here rather
          than beside it because it produces the same artifact (every view in
          one document), just opened instead of downloaded. */}
      <div className="toolbar-btn-group">
        <Button
          variant="actionable"
          className="rounded-r-none border-r-0"
          onClick={onExport}
          aria-label={t("preview.export.svg.ariaLabel")}
          disabled={!exportAvailable}
        >
          {t("preview.export.svg.label")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="actionable"
              className="rounded-l-none px-1.5"
              aria-label={t("preview.export.options.ariaLabel")}
            >
              ▾
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onExportDrillDown} disabled={!drillDownAvailable}>
              {t("preview.export.drillDown.label")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportAllDiagrams} disabled={!allViewsAvailable}>
              {t("preview.export.allDiagrams.label")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onExportDrawio}
              disabled={!drawio}
              title={t("preview.export.drawio.title")}
            >
              {t("preview.export.drawio.label")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onOpenAllViews}
              disabled={!allViewsAvailable}
              aria-label={t("preview.openAllViews.ariaLabel")}
            >
              ⊟ {t("preview.openAllViews.label")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        variant="actionable"
        onClick={onShare}
        aria-label={t("preview.share.ariaLabel")}
        disabled={!shareAvailable}
      >
        {t("preview.share.label")}
      </Button>

      {/* Documentation links: the in-app Reference pop-out and the external
          docs site, grouped since both point at documentation. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="actionable" aria-label={t("preview.docs.ariaLabel")}>
            {t("preview.docs.label")} ▾
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => openReferenceWindow(activeView)}>
            {t("preview.docs.reference.label")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={docsSiteUrl(locale)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("preview.docs.site.ariaLabel")}
            >
              {t("preview.docs.site.label")}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="actionable"
        aria-pressed={previewFocused}
        onClick={onPreviewFocusToggle}
        aria-label={
          previewFocused ? t("preview.focus.exit.ariaLabel") : t("preview.focus.ariaLabel")
        }
      >
        {previewFocused ? `↙ ${t("preview.focus.exit.label")}` : `↗ ${t("preview.focus.label")}`}
      </Button>
    </>
  );
}
