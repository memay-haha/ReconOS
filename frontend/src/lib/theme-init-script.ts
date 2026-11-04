// Runs inline in <head>, before first paint, so a stored theme never flashes the OS theme.
// Self-contained on purpose: it is serialised into the page as plain text.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('reconos-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
