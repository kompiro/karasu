import { useCallback, useMemo, useRef, useState } from "react";
import {
  translateInfraConfig,
  type TranslateFormat,
  type TranslateResult,
} from "@karasu-tools/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "../i18n/index.js";

/**
 * In-App equivalent of the `karasu translate` CLI command (Issue #1463).
 *
 * Converts an infra config or API spec — docker-compose, a k8s manifest, an
 * OpenAPI spec, or a DB schema — into a `.krs` scaffold entirely client-side:
 * `translateInfraConfig` lives in `@karasu-tools/core` and is browser-portable,
 * so this works in every App mode (Project / Memory / Serve) without a server.
 *
 * The result can be copied or downloaded as a `.krs` file — the App-side
 * analogue of the CLI writing to stdout / `--output`.
 */

/** Translation key for each format's display label. */
const FORMAT_LABEL_KEY = {
  compose: "translateDialog.format.compose",
  k8s: "translateDialog.format.k8s",
  openapi: "translateDialog.format.openapi",
  db: "translateDialog.format.db",
} as const satisfies Record<TranslateFormat, string>;

// Placeholder source snippets are sample code (YAML / SQL), not natural
// language, so they stay as literals rather than going through i18n.
const FORMAT_PLACEHOLDERS: Record<TranslateFormat, string> = {
  compose: "services:\n  order-service:\n    image: order-service:1.0.0",
  k8s: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: order-service",
  openapi: "openapi: 3.0.0\ninfo:\n  title: Order API\npaths:\n  /orders:\n    get: {}",
  db: "CREATE TABLE orders (\n  id BIGINT PRIMARY KEY\n);",
};

/** Formats that emit logical blocks and so accept `system` / bindings / granularity. */
function isLogicalFormat(format: TranslateFormat): boolean {
  return format === "openapi" || format === "db";
}

const TEXTAREA_CLASS =
  "w-full rounded border border-[color:var(--border-strong)] bg-transparent p-2 font-mono text-xs text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-secondary)]";

const FIELD_LABEL_CLASS = "flex flex-col gap-1 text-xs text-[color:var(--text-secondary)]";

const TEXT_INPUT_CLASS =
  "rounded border border-[color:var(--border-strong)] bg-transparent px-2 py-1 text-sm text-[color:var(--text-primary)] outline-none";

export function TranslateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<TranslateFormat>("compose");
  const [inputText, setInputText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [mapFile, setMapFile] = useState("");
  const [service, setService] = useState("");
  const [database, setDatabase] = useState("");
  const [granularity, setGranularity] = useState("");
  const [emitBindings, setEmitBindings] = useState(false);
  const [emitCrudDecoration, setEmitCrudDecoration] = useState(false);
  const [system, setSystem] = useState("");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const logical = isLogicalFormat(format);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const handleFormatChange = useCallback(
    (next: TranslateFormat) => {
      setFormat(next);
      // Granularity values are per-format; clear so the default applies.
      setGranularity("");
      reset();
    },
    [reset],
  );

  const handleFileChosen = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceName(file.name.replace(/\.[^.]+$/, ""));
    void file.text().then((text) => setInputText(text));
  }, []);

  const handleTranslate = useCallback(async () => {
    reset();
    try {
      const out = await translateInfraConfig(inputText, {
        from: format,
        inputName: sourceName.trim() || undefined,
        mapFile: !logical && mapFile.trim() ? mapFile : undefined,
        service: format === "openapi" && service.trim() ? service.trim() : undefined,
        database: format === "db" && database.trim() ? database.trim() : undefined,
        granularity: logical && granularity ? (granularity as never) : undefined,
        emitBindings: logical ? emitBindings : undefined,
        emitCrudDecoration: logical ? emitCrudDecoration : undefined,
        system: logical && system.trim() ? system.trim() : undefined,
      });
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    reset,
    inputText,
    format,
    sourceName,
    logical,
    mapFile,
    service,
    database,
    granularity,
    emitBindings,
    emitCrudDecoration,
    system,
  ]);

  const handleCopy = useCallback(() => {
    if (result) void navigator.clipboard.writeText(result.krs);
  }, [result]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.krs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sourceName.trim() || format}.krs`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [result, sourceName, format]);

  const granularityOptions = useMemo(
    () =>
      format === "openapi"
        ? [
            { value: "", label: t("translateDialog.granularity.resourceDefault") },
            { value: "operation", label: t("translateDialog.granularity.operation") },
          ]
        : [
            { value: "", label: t("translateDialog.granularity.aggregateDefault") },
            { value: "table", label: t("translateDialog.granularity.table") },
          ],
    [format, t],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        hideCloseButton
        className="w-[90vw] max-w-[680px] gap-3"
        aria-labelledby="translate-dialog-title"
      >
        <DialogHeader>
          <DialogTitle id="translate-dialog-title">{t("translateDialog.title")}</DialogTitle>
          <DialogDescription>{t("translateDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          <label className={FIELD_LABEL_CLASS}>
            {t("translateDialog.format.label")}
            <select
              className={TEXT_INPUT_CLASS}
              value={format}
              onChange={(e) => handleFormatChange(e.target.value as TranslateFormat)}
              aria-label={t("translateDialog.format.label")}
            >
              {(Object.keys(FORMAT_LABEL_KEY) as TranslateFormat[]).map((f) => (
                <option key={f} value={f}>
                  {t(FORMAT_LABEL_KEY[f])}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[color:var(--text-secondary)]">
              {t("translateDialog.loadHint")}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChosen}
              aria-label={t("translateDialog.loadFile.aria")}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              {t("translateDialog.loadFile")}
            </Button>
          </div>

          <textarea
            className={TEXTAREA_CLASS}
            rows={8}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              reset();
            }}
            placeholder={FORMAT_PLACEHOLDERS[format]}
            spellCheck={false}
            aria-label={t("translateDialog.sourceContent")}
          />

          <details className="text-xs text-[color:var(--text-secondary)]">
            <summary className="cursor-pointer select-none">
              {t("translateDialog.advanced")}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <label className={FIELD_LABEL_CLASS}>
                {t("translateDialog.sourceName.label")}
                <input
                  className={TEXT_INPUT_CLASS}
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder={format === "db" ? "OrderDB" : "production"}
                  aria-label={t("translateDialog.sourceName.aria")}
                />
              </label>

              {format === "openapi" && (
                <label className={FIELD_LABEL_CLASS}>
                  {t("translateDialog.service.label")}
                  <input
                    className={TEXT_INPUT_CLASS}
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    placeholder="ECommerce"
                    aria-label={t("translateDialog.service.aria")}
                  />
                </label>
              )}

              {format === "db" && (
                <label className={FIELD_LABEL_CLASS}>
                  {t("translateDialog.database")}
                  <input
                    className={TEXT_INPUT_CLASS}
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    placeholder="OrderDB"
                    aria-label={t("translateDialog.database")}
                  />
                </label>
              )}

              {logical && (
                <>
                  <label className={FIELD_LABEL_CLASS}>
                    {t("translateDialog.granularity.label")}
                    <select
                      className={TEXT_INPUT_CLASS}
                      value={granularity}
                      onChange={(e) => setGranularity(e.target.value)}
                      aria-label={t("translateDialog.granularity.label")}
                    >
                      {granularityOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={emitBindings}
                      onChange={(e) => setEmitBindings(e.target.checked)}
                    />
                    {t("translateDialog.emitBindings")}
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={emitCrudDecoration}
                      onChange={(e) => setEmitCrudDecoration(e.target.checked)}
                    />
                    {t("translateDialog.emitCrudDecoration")}
                  </label>

                  <label className={FIELD_LABEL_CLASS}>
                    {t("translateDialog.system.label")}
                    <input
                      className={TEXT_INPUT_CLASS}
                      value={system}
                      onChange={(e) => setSystem(e.target.value)}
                      placeholder="Orders"
                      aria-label={t("translateDialog.system.aria")}
                    />
                  </label>
                </>
              )}

              {!logical && (
                <label className={FIELD_LABEL_CLASS}>
                  {t("translateDialog.mapFile.label")}
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={3}
                    value={mapFile}
                    onChange={(e) => setMapFile(e.target.value)}
                    placeholder="order-service: OrderService"
                    spellCheck={false}
                    aria-label={t("translateDialog.mapFile.aria")}
                  />
                </label>
              )}
            </div>
          </details>

          {error && (
            <p className="rounded bg-[color:var(--danger-bg,#fde8e8)] px-2 py-1 text-xs text-[color:var(--danger,#b91c1c)]">
              {error}
            </p>
          )}

          {result && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--text-secondary)]">
                {t("translateDialog.result")}
              </span>
              <textarea
                className={TEXTAREA_CLASS}
                rows={10}
                value={result.krs}
                readOnly
                spellCheck={false}
                aria-label={t("translateDialog.result")}
              />
              {result.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-[color:var(--warning,#b45309)]">
                  {result.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t("translateDialog.close")}</Button>
          {result ? (
            <>
              <Button onClick={handleDownload}>{t("translateDialog.download")}</Button>
              <Button variant="actionable" onClick={handleCopy}>
                {t("translateDialog.copy")}
              </Button>
            </>
          ) : (
            <Button
              variant="actionable"
              onClick={() => void handleTranslate()}
              disabled={!inputText.trim()}
            >
              {t("translateDialog.translate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
