window.WebDocSachData = (() => {
  const R2_DATA_BASE_URL =
    'https://webdocsach-data-api.huydd12401.workers.dev';

  function createBookDataUrl(bookId, relativePath) {
    const cleanBookId = String(bookId || '')
      .replace(/^\/+|\/+$/g, '');

    const cleanPath = String(relativePath || '')
      .replace(/^\/+/, '');

    return (
      `${R2_DATA_BASE_URL}/data/` +
      `${cleanBookId}/${cleanPath}`
    );
  }

  return Object.freeze({
    createBookDataUrl
  });
})();