const ALLOWED_ORIGINS = new Set([
  'https://huydd1004.github.io',
  'http://localhost:3000'
]);

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const MAX_SYNC_SIZE = 512 * 1024;
const ALLOWED_DATA_EXTENSIONS = new Set(['txt', 'json']);

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

function hasAdminAccess(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const expectedAuthorization = env.ADMIN_TOKEN ? `Bearer ${env.ADMIN_TOKEN}` : '';

  return Boolean(expectedAuthorization && authorization === expectedAuthorization);
}

function isSafeObjectKey(key) {
  if (
    !key ||
    key.includes('\0') ||
    key.includes('\\')
  ) {
    return false;
  }

  const segments = key.split('/');

  const hasUnsafeSegment = segments.some(
    segment =>
      !segment ||
      segment === '.' ||
      segment === '..'
  );

  if (hasUnsafeSegment) {
    return false;
  }

  const extension = key
    .split('.')
    .pop()
    ?.toLowerCase();

  if (key.startsWith('data/')) {
    return ALLOWED_DATA_EXTENSIONS.has(
      extension
    );
  }

  if (key.startsWith('assets/images/')) {
    return ALLOWED_IMAGE_EXTENSIONS.has(
      extension
    );
  }

  return false;
}

function createCorsHeaders(origin) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function getSyncSecret(request) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const secret = match?.[1]?.trim() || '';

  if (secret.length < 12 || secret.length > 128) {
    return '';
  }

  return secret;
}

async function hashSyncSecret(secret) {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

async function handleSyncRequest(request, env, origin) {
  const secret = getSyncSecret(request);
  if (!secret) {
    return createJsonResponse({
      error: 'Mã đồng bộ phải có ít nhất 12 ký tự'
    }, 401, origin);
  }

  const objectKey = `_sync/${await hashSyncSecret(secret)}.json`;

  if (request.method === 'PUT') {
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_SIZE) {
      return createJsonResponse({
        error: 'Dữ liệu đồng bộ vượt quá giới hạn 512KB'
      }, 413, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return createJsonResponse({ error: 'Dữ liệu đồng bộ không hợp lệ' }, 400, origin);
    }

    if (!payload || payload.app !== 'WebDocSach' || typeof payload.data !== 'object') {
      return createJsonResponse({ error: 'Sai định dạng dữ liệu đồng bộ' }, 400, origin);
    }

    const serialized = JSON.stringify({
      ...payload,
      syncedAt: new Date().toISOString()
    });

    if (new TextEncoder().encode(serialized).byteLength > MAX_SYNC_SIZE) {
      return createJsonResponse({
        error: 'Dữ liệu đồng bộ vượt quá giới hạn 512KB'
      }, 413, origin);
    }

    await env.BOOKS_BUCKET.put(objectKey, serialized, {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store'
      }
    });

    return createJsonResponse({ success: true }, 200, origin);
  }

  const object = request.method === 'HEAD'
    ? await env.BOOKS_BUCKET.head(objectKey)
    : await env.BOOKS_BUCKET.get(objectKey);

  if (!object) {
    return createJsonResponse({ error: 'Chưa có dữ liệu đồng bộ' }, 404, origin);
  }

  const headers = createCorsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: 200,
    headers
  });
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
      request.method !== 'HEAD' &&
      request.method !== 'PUT'
    ) {
      return createJsonResponse(
        {
          error: 'Phương thức không được hỗ trợ'
        },
        405,
        origin
      );
    }

    if (url.pathname === '/' && request.method !== 'PUT') {
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

    if (url.pathname === '/sync') {
      try {
        return await handleSyncRequest(request, env, origin);
      } catch (error) {
        console.error(error);
        return createJsonResponse({ error: 'Không thể đồng bộ dữ liệu' }, 500, origin);
      }
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

    if (key.startsWith('_sync/')) {
      return createJsonResponse({ error: 'Không tìm thấy dữ liệu' }, 404, origin);
    }

    if (request.method === 'PUT') {
      if (!hasAdminAccess(request, env)) {
        return createJsonResponse({
          error: 'Không có quyền tải dữ liệu'
        }, 401, origin);
      }

      if (!isSafeObjectKey(key)) {
        return createJsonResponse({
          error: 'Đường dẫn hoặc loại file không hợp lệ'
        }, 400, origin);
      }

      const contentLength = Number(request.headers.get('Content-Length') || 0);

      if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_SIZE) {
        return createJsonResponse({
          error: 'File vượt quá giới hạn 20MB'
        }, 413, origin);
      }

      try {
        const uploadedObject = await env.BOOKS_BUCKET.put(key, request.body, {
          httpMetadata: {
            contentType: getContentType(key),
            cacheControl: 'public, max-age=300'
          }
        });

        return createJsonResponse({
          success: true,
          key,
          size: uploadedObject?.size || contentLength
        }, 201, origin);
      } catch (error) {
        console.error(error);

        return createJsonResponse({
          error: 'Không thể tải file lên R2'
        }, 500, origin);
      }
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
      const cacheControl =
      key.toLowerCase().endsWith('.json')
      ? 'no-store'
      : 'public, max-age=3600';

      headers.set(
        'Cache-Control',
        cacheControl
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
