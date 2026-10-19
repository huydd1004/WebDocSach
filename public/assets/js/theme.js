(() => {
  const THEME_KEY = 'webdocsachSiteTheme';
  const root = document.documentElement;
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

  function getSavedTheme() {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);

      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
    } catch (error) {
      // Tiếp tục dùng giao diện theo hệ thống.
    }

    return systemTheme.matches ? 'dark' : 'light';
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      // Bỏ qua nếu trình duyệt không cho lưu.
    }
  }

  function updateThemeButtons() {
    const isDark = root.dataset.theme === 'dark';

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const icon = button.querySelector('.theme-toggle-icon');

      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute(
        'aria-label',
        isDark
          ? 'Chuyển sang giao diện sáng'
          : 'Chuyển sang giao diện tối'
      );

      button.title = isDark
        ? 'Giao diện sáng'
        : 'Giao diện tối';

      if (icon) {
        icon.textContent = isDark ? '☀' : '☾';
      }
    });
  }

  function applyTheme(theme, shouldSave = false) {
    root.dataset.theme = theme;

    if (shouldSave) {
      saveTheme(theme);
    }

    updateThemeButtons();
  }

  applyTheme(getSavedTheme());

  function initializeThemeButtons() {
    updateThemeButtons();

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const nextTheme =
          root.dataset.theme === 'dark' ? 'light' : 'dark';

        applyTheme(nextTheme, true);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initializeThemeButtons
    );
  } else {
    initializeThemeButtons();
  }

  systemTheme.addEventListener('change', event => {
    try {
      if (localStorage.getItem(THEME_KEY)) {
        return;
      }
    } catch (error) {
      // Tiếp tục áp dụng giao diện hệ thống.
    }

    applyTheme(event.matches ? 'dark' : 'light');
  });
})();