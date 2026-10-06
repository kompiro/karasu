import { Button } from "@/components/ui/button";
import { useTheme } from "../theme/index.js";
import { useTranslation } from "../i18n/index.js";

/**
 * Theme and language switches for the viewer's preview toolbar (#2997).
 *
 * The app keeps these in its settings and persists them; the viewer runs in an
 * opaque origin where nothing persists, so it offers them in plain sight
 * instead. Each switch shows where it goes, not where it is. The language
 * switch's visible text names the target language in that language (an
 * endonym, so it is not translated); its aria-label is translated like every
 * other control's.
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
        onClick={() => setLocale(nextLocale)}
        aria-label={t(
          nextLocale === "en"
            ? "viewer.locale.toEnglish.ariaLabel"
            : "viewer.locale.toJapanese.ariaLabel",
        )}
      >
        🌐 <span lang={nextLocale}>{nextLocale === "en" ? "English" : "日本語"}</span>
      </Button>
    </>
  );
}
