import { installCustomTheme, isKnownThemePreference, parseThemeFile } from "../../themePalette";
import { setTheme, setAppearanceMode } from "../../hooks/useTheme";
import theme from "./theme.json";

export function installBoardTheme() {
  if (!isKnownThemePreference("t3-duo")) installCustomTheme(parseThemeFile(theme));
  setTheme("t3-duo");
  setAppearanceMode("dark");
}
