const ALLOWED_ORIGINS = new Set([
  'https://huydd1004.github.io',
  'http://localhost:3000'
]);

function createCorsHeaders(origin) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  });

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

function createJsonResponse(data, status, origin) {
  const headers = createCorsHeaders(origin);

  headers.set(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers
    }
  );
}

function getContentType(key) {
  const extension = key
    .split('.')
    .pop()
    ?.toLowerCase();

  const contentTypes = {
    json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    webp: 'image/webp',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml'
  };

  return contentTypes[extension] ||
    'application/octet-stream';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(origin)
      });
    }

    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD'
    ) {
      return createJsonResponse(
        {
          error: 'Phương thức không được hỗ trợ'
        },
        405,
        origin
      );
    }

    if (url.pathname === '/') {
      return createJsonResponse(
        {
          service: 'webdocsach-data-api',
          status: 'ok',
          bucketConnected: Boolean(env.BOOKS_BUCKET)
        },
        200,
        origin
      );
    }

    let key;

    try {
      key = decodeURIComponent(
        url.pathname.replace(/^\/+/, '')
      );
    } catch {
      return createJsonResponse(
        {
          error: 'Đường dẫn không hợp lệ'
        },
        400,
        origin
      );
    }

    try {
      const object =
        request.method === 'HEAD'
          ? await env.BOOKS_BUCKET.head(key)
          : await env.BOOKS_BUCKET.get(key);

      if (!object) {
        return createJsonResponse(
          {
            error: 'Không tìm thấy dữ liệu',
            key
          },
          404,
          origin
        );
      }

      const headers = createCorsHeaders(origin);

      object.writeHttpMetadata(headers);

      headers.set('ETag', object.httpEtag);
      headers.set(
        'Content-Type',
        headers.get('Content-Type') ||
          getContentType(key)
      );
      headers.set(
        'Cache-Control',
        'public, max-age=3600'
      );
      headers.set(
        'X-Content-Type-Options',
        'nosniff'
      );

      return new Response(
        request.method === 'HEAD'
          ? null
          : object.body,
        {
          status: 200,
          headers
        }
      );
    } catch (error) {
      console.error(error);

      return createJsonResponse(
        {
          error: 'Không thể đọc dữ liệu từ R2'
        },
        500,
        origin
      );
    }
  }
};