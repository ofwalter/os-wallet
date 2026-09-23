// Kept free of React imports so the root (server) layout can inline it.
export const THEME_KEY = "theme";

// Runs before first paint: applies the saved preference, else the OS scheme,
// and keeps following the OS while the preference is "system".
export const THEME_SCRIPT = `(() => {
  const m = matchMedia("(prefers-color-scheme: dark)");
  const pref = () => { try { return localStorage.getItem("${THEME_KEY}") || "system"; } catch { return "system"; } };
  const apply = () => {
    const p = pref();
    document.documentElement.classList.toggle("dark", p === "dark" || (p === "system" && m.matches));
  };
  apply();
  m.addEventListener("change", apply);
  window.__applyTheme = apply;
})();`;
