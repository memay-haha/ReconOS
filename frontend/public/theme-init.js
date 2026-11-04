// Applies the remembered theme before first paint. Loaded as a blocking classic script
// from <head> in src/app/layout.tsx: a deferred or module script would run after the
// first paint and flash the operating system theme.
// Served as a static file, not inlined, because .claude/rules/security.md forbids
// dangerouslySetInnerHTML. The storage key must stay equal to THEME_STORAGE_KEY in
// src/components/theme-toggle.tsx; src/components/theme-init.test.ts guards that.
(function () {
  try {
    var stored = localStorage.getItem('reconos-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch {
    // Storage can throw (private window, blocked site data). The page then renders in
    // the operating system theme, which is the documented fallback.
  }
})();
