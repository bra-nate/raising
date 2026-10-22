try {
  var theme = localStorage.getItem('sl_theme');
  if (!theme) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if (theme === 'dark') document.documentElement.classList.add('dark');
} catch (_) {}
