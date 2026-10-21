window.WebDocSachData = (() => {
  const R2_BASE_URL =
    'https://webdocsach-data-api.huydd12401.workers.dev';

  function createDataUrl(relativePath) {
    const cleanPath = String(relativePath || '')
      .replace(/^\/+/, '');

    return `${R2_BASE_URL}/data/${cleanPath}`;
  }

  function createBookDataUrl(bookId, relativePath) {
    const cleanBookId = String(bookId || '')
      .replace(/^\/+|\/+$/g, '');

    const cleanPath = String(relativePath || '')
      .replace(/^\/+/, '');

    return createDataUrl(
      `${cleanBookId}/${cleanPath}`
    );
  }

  return Object.freeze({
    createDataUrl,
    createBookDataUrl
  });
})();