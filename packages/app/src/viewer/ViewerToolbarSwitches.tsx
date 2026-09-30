import { Button } from "@/components/ui/button";
import { useTheme } from "../theme/index.js";
import { useTranslation } from "../i18n/index.js";

/**
 * Theme and language switches for the viewer's preview toolbar (#2997).
 *
 * The app keeps these in its settings and persists them; the viewer runs in an
 * opaque origin where nothing persists, so it offers them in plain sight
 * instead. Each switch shows where it goes, not where it is. The language
 * switch names the target language in that language (an endonym), which is
 * why it is not translated.
 */
export function ViewerToolbarSwitches() {
  const { effectiveTheme, setTheme } = useTheme();
  const { t, locale, setLocale } = useTranslation();
  const toLight = effectiveTheme === "dark";
  const nextLocale = locale === "ja" ? "en" : "ja";
  return (
    <>
      <Button
        variant="actionable"
        onClick={() => setTheme(toLight ? "light" : "dark")}
        aria-label={t(toLight ? "viewer.theme.toLight.ariaLabel" : "viewer.theme.toDark.ariaLabel")}
      >
        {toLight ? `☀ ${t("theme.light")}` : `☾ ${t("theme.dark")}`}
      </Button>
      <Button
        variant="actionable"
        lang={nextLocale}
        onClick={() => setLocale(nextLocale)}
        aria-label={nextLocale === "en" ? "Switch to English" : "日本語に切り替える"}
      >
        {nextLocale === "en" ? "🌐 English" : "🌐 日本語"}
      </Button>
    </>
  );
}
