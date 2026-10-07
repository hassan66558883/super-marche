// Apply the persisted theme before first paint to avoid a flash (external file: CSP forbids inline scripts)
/* global localStorage, matchMedia, document */
try {
  var t = JSON.parse(localStorage.getItem('technova-ui') || '{}').state?.theme || 'light';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch { /* storage disabled */ }
