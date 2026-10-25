const API_BASE_URL =
  'https://webdocsach-data-api.huydd12401.workers.dev';

const MAX_UPLOAD_SIZE =
  20 * 1024 * 1024;

const form = document.getElementById(
  'bookUploadForm'
);

const adminTokenInput = document.getElementById(
  'adminToken'
);

const bookIdInput = document.getElementById(
  'bookId'
);

const bookTitleInput = document.getElementById(
  'bookTitle'
);

const bookAuthorInput = document.getElementById(
  'bookAuthor'
);

const bookStatusInput = document.getElementById(
  'bookStatus'
);

const bookDateInput = document.getElementById(
  'bookDate'
);

const bookGenresInput = document.getElementById(
  'bookGenres'
);

const bookDescriptionInput =
  document.getElementById(
    'bookDescription'
  );

const coverFileInput = document.getElementById(
  'coverFile'
);

const chapterFolderInput =
  document.getElementById(
    'chapterFolder'
  );

const validateButton = document.getElementById(
  'validateBookButton'
);

const uploadButton = document.getElementById(
  'uploadBookButton'
);

const progressWrapper = document.getElementById(
  'uploadProgressWrapper'
);

const progressBar = document.getElementById(
  'uploadProgress'
);

const progressText = document.getElementById(
  'uploadProgressText'
);

const statusElement = document.getElementById(
  'adminStatus'
);

const summaryElement = document.getElementById(
  'uploadSummary'
);

let preparedUpload = null;

function showStatus(message, type = '') {
  statusElement.textContent = message;
  statusElement.className = 'admin-status';

  if (type) {
    statusElement.classList.add(
      `is-${type}`
    );
  }
}

function setDefaultDate() {
  if (bookDateInput.value) {
    return;
  }

  const now = new Date();

  const localDate = new Date(
    now.getTime() -
    now.getTimezoneOffset() * 60_000
  )
    .toISOString()
    .slice(0, 10);

  bookDateInput.value = localDate;
}

function formatDateForCatalog(value) {
  const [
    year,
    month,
    day
  ] = String(value).split('-');

  if (!year || !month || !day) {
    return '';
  }

  return `${day}/${month}/${year}`;
}

function getFileExtension(fileName) {
  return String(fileName)
    .split('.')
    .pop()
    ?.toLowerCase() || '';
}

function getRelativeChapterPath(file) {
  const originalPath =
    file.webkitRelativePath ||
    file.name;

  const parts = originalPath
    .split('/')
    .filter(Boolean);

  if (parts.length > 1) {
    return parts
      .slice(1)
      .join('/');
  }

  return parts[0] || file.name;
}

async function readChapterTitle(
  file,
  chapterNumber
) {
  const content = (
  await file.slice(0, 64 * 1024).text()
  ).replace(/^\uFEFF/, '');

  const firstLine = content
    .split(/\r?\n/)
    .find(line => line.trim());

  if (!firstLine) {
    return `Chương ${chapterNumber}`;
  }

  return firstLine
    .replace(/^\*+|\*+$/g, '')
    .trim() || `Chương ${chapterNumber}`;
}

function resetPreparedUpload() {
  preparedUpload = null;
  uploadButton.disabled = true;

  summaryElement.hidden = true;
  summaryElement.textContent = '';

  progressWrapper.hidden = true;
  progressBar.value = 0;
  progressText.textContent = 'Đang chuẩn bị...';
}

setDefaultDate();

async function collectChapterEntries() {
  const selectedFiles = Array.from(
    chapterFolderInput.files || []
  );

  const chapterFiles = selectedFiles.filter(
    file =>
      getFileExtension(file.name) === 'txt'
  );

  if (chapterFiles.length === 0) {
    throw new Error(
      'Thư mục không có file chương .txt.'
    );
  }

  const entries = await Promise.all(
    chapterFiles.map(async file => {
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(
          `${file.name} vượt quá giới hạn 20 MB.`
        );
      }

      const chapterNumber = Number(
        file.name.replace(/\.txt$/i, '')
      );

      if (
        !Number.isInteger(chapterNumber) ||
        chapterNumber <= 0
      ) {
        throw new Error(
          `Tên file không hợp lệ: ${file.name}`
        );
      }

      return {
        number: chapterNumber,
        title: await readChapterTitle(
          file,
          chapterNumber
        ),
        path: getRelativeChapterPath(file),
        file
      };
    })
  );

  entries.sort(
    (first, second) =>
      first.number - second.number
  );

  for (
    let index = 1;
    index < entries.length;
    index += 1
  ) {
    if (
      entries[index].number ===
      entries[index - 1].number
    ) {
      throw new Error(
        `Trùng chương ${entries[index].number}.`
      );
    }
  }

  return entries;
}

function getSelectedGenres() {
  return [
    ...new Set(
      bookGenresInput.value
        .split(',')
        .map(genre => genre.trim())
        .filter(Boolean)
    )
  ];
}

async function prepareBookUpload() {
  resetPreparedUpload();

  if (!form.reportValidity()) {
    showStatus(
      'Hãy điền đầy đủ các trường bắt buộc.',
      'error'
    );

    return;
  }

  validateButton.disabled = true;

  showStatus(
    'Đang kiểm tra dữ liệu...'
  );

  try {
    const coverFile =
      coverFileInput.files?.[0];

    if (!coverFile) {
      throw new Error(
        'Bạn chưa chọn ảnh bìa.'
      );
    }

    if (coverFile.size > MAX_UPLOAD_SIZE) {
      throw new Error(
        'Ảnh bìa vượt quá giới hạn 20 MB.'
      );
    }

    const allowedCoverExtensions =
      new Set([
        'jpg',
        'jpeg',
        'png',
        'webp'
      ]);

    const coverExtension =
      getFileExtension(coverFile.name);

    if (
      !allowedCoverExtensions.has(
        coverExtension
      )
    ) {
      throw new Error(
        'Ảnh bìa phải là JPG, PNG hoặc WEBP.'
      );
    }

    const chapterEntries =
      await collectChapterEntries();

    const bookId =
      bookIdInput.value.trim();

    const coverKey =
      `assets/images/` +
      `${bookId}.${coverExtension}`;

    const book = {
      id: bookId,
      title: bookTitleInput.value.trim(),
      author: bookAuthorInput.value.trim(),
      status: bookStatusInput.value,
      date: formatDateForCatalog(
        bookDateInput.value
      ),
      cover:
        `${API_BASE_URL}/${coverKey}`,
      genre: getSelectedGenres(),
      description:
        bookDescriptionInput.value.trim()
    };

    const chapters = chapterEntries.map(
      chapter => ({
        number: chapter.number,
        title: chapter.title,
        path: chapter.path
      })
    );

    const index = {
      total: chapters.length,
      firstChapter:
        chapters[0]?.number || 0,
      lastChapter:
        chapters.at(-1)?.number || 0
    };

    const totalChapterBytes =
      chapterEntries.reduce(
        (total, chapter) =>
          total + chapter.file.size,
        0
      );

    preparedUpload = {
      book,
      chapters,
      index,
      chapterEntries,
      coverFile,
      coverKey
    };

    summaryElement.textContent = [
      `Truyện: ${book.title}`,
      `Mã truyện: ${book.id}`,
      `Tác giả: ${book.author}`,
      `Số chương: ${chapters.length}`,
      `Chương đầu: ${index.firstChapter}`,
      `Chương cuối: ${index.lastChapter}`,
      `Dung lượng chương: ` +
        `${(
          totalChapterBytes /
          1024 /
          1024
        ).toFixed(2)} MB`,
      `Ảnh bìa: ${coverFile.name}`,
      '',
      'Dữ liệu hợp lệ và sẵn sàng tải lên.'
    ].join('\n');

    summaryElement.hidden = false;
    uploadButton.disabled = false;

    showStatus(
      `Đã kiểm tra ${chapters.length} chương.`,
      'success'
    );
  } catch (error) {
    resetPreparedUpload();

    showStatus(
      error instanceof Error
        ? error.message
        : 'Không thể kiểm tra dữ liệu.',
      'error'
    );
  } finally {
    validateButton.disabled = false;
  }
}

function invalidatePreparedUpload(event) {
  if (event?.target === adminTokenInput) {
    return;
  }

  if (!preparedUpload) {
    return;
  }

  resetPreparedUpload();

  showStatus(
    'Dữ liệu đã thay đổi. Hãy kiểm tra lại.'
  );
}

validateButton.addEventListener(
  'click',
  prepareBookUpload
);

form.addEventListener(
  'input',
  invalidatePreparedUpload
);

form.addEventListener(
  'change',
  invalidatePreparedUpload
);

function createJsonBlob(data) {
  return new Blob(
    [
      `${JSON.stringify(data, null, 2)}\n`
    ],
    {
      type:
        'application/json; charset=utf-8'
    }
  );
}

function encodeObjectKey(key) {
  return String(key)
    .split('/')
    .map(segment =>
      encodeURIComponent(segment)
    )
    .join('/');
}

function getCoverContentType(file) {
  const extension = getFileExtension(
    file.name
  );

  const contentTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };

  return (
    contentTypes[extension] ||
    file.type ||
    'application/octet-stream'
  );
}

async function uploadObject(
  key,
  body,
  contentType,
  adminToken
) {
  const response = await fetch(
    `${API_BASE_URL}/` +
    encodeObjectKey(key),
    {
      method: 'PUT',
      headers: {
        Authorization:
          `Bearer ${adminToken}`,
        'Content-Type': contentType
      },
      body
    }
  );

  let result = {};

  try {
    result = await response.json();
  } catch (error) {
    result = {};
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
      `Không thể tải ${key}`
    );
  }

  return result;
}

async function runUploadPool(
  items,
  uploadItem,
  onProgress,
  concurrency = 4
) {
  let nextIndex = 0;
  let completed = 0;

  const failures = [];

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      const item = items[currentIndex];

      try {
        await uploadItem(item);
      } catch (error) {
        failures.push({
          key: item.key,
          message:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }

      completed += 1;

      onProgress(
        completed,
        items.length,
        item
      );
    }
  }

  const workerCount = Math.min(
    concurrency,
    items.length
  );

  await Promise.all(
    Array.from(
      {
        length: workerCount
      },
      () => runWorker()
    )
  );

  return failures;
}

async function createUpdatedCatalog(book) {
  const response = await fetch(
    `${API_BASE_URL}/data/books.json` +
    `?time=${Date.now()}`,
    {
      cache: 'no-store'
    }
  );

  let catalog = [];

  if (response.ok) {
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        'books.json trên R2 không hợp lệ.'
      );
    }

    catalog = data;
  } else if (response.status !== 404) {
    throw new Error(
      'Không thể đọc books.json từ R2.'
    );
  }

  const existingIndex = catalog.findIndex(
    item => item.id === book.id
  );

  const previousBook =
    existingIndex >= 0
      ? catalog[existingIndex]
      : null;

  const nextBook = {
    ...book
  };

  if (previousBook?.featured === true) {
    nextBook.featured = true;
  }

  if (existingIndex >= 0) {
    catalog[existingIndex] = nextBook;
  } else {
    catalog.push(nextBook);
  }

  return catalog;
}

function buildUploadItems(data) {
  const chapterItems =
    data.chapterEntries.map(chapter => ({
      key:
        `data/${data.book.id}/` +
        chapter.path,
      body: chapter.file,
      contentType:
        'text/plain; charset=utf-8'
    }));

  return [
    ...chapterItems,
    {
      key: data.coverKey,
      body: data.coverFile,
      contentType:
        getCoverContentType(
          data.coverFile
        )
    },
    {
      key:
        `data/${data.book.id}/` +
        'chapters.json',
      body: createJsonBlob(
        data.chapters
      ),
      contentType:
        'application/json; charset=utf-8'
    },
    {
      key:
        `data/${data.book.id}/` +
        'index.json',
      body: createJsonBlob(
        data.index
      ),
      contentType:
        'application/json; charset=utf-8'
    }
  ];
}

async function uploadPreparedBook(event) {
  event.preventDefault();

  if (!preparedUpload) {
    showStatus(
      'Hãy kiểm tra dữ liệu trước khi tải lên.',
      'error'
    );

    return;
  }

  const adminToken =
    adminTokenInput.value.trim();

  if (!adminToken) {
    showStatus(
      'Bạn chưa nhập ADMIN_TOKEN.',
      'error'
    );

    adminTokenInput.focus();
    return;
  }

  const uploadData = preparedUpload;

  const uploadItems =
    buildUploadItems(uploadData);

  const totalSteps =
    uploadItems.length + 1;

  uploadButton.disabled = true;
  validateButton.disabled = true;

  progressWrapper.hidden = false;
  progressBar.max = totalSteps;
  progressBar.value = 0;

  progressText.textContent =
    `Chuẩn bị tải ${uploadItems.length} file...`;

  showStatus(
    'Đang tải truyện lên R2...'
  );

  try {
    const failures = await runUploadPool(
      uploadItems,
      item =>
        uploadObject(
          item.key,
          item.body,
          item.contentType,
          adminToken
        ),
      (completed, total, item) => {
        progressBar.value = completed;

        progressText.textContent =
          `Đã tải ${completed}/${totalSteps}: ` +
          item.key;
      }
    );

    if (failures.length > 0) {
      const firstFailure = failures[0];

      throw new Error(
        `Có ${failures.length} file tải thất bại. ` +
        `${firstFailure.key}: ` +
        firstFailure.message
      );
    }

    progressText.textContent =
      'Đang cập nhật danh mục books.json...';

    const updatedCatalog =
      await createUpdatedCatalog(
        uploadData.book
      );

    await uploadObject(
      'data/books.json',
      createJsonBlob(updatedCatalog),
      'application/json; charset=utf-8',
      adminToken
    );

    progressBar.value = totalSteps;

    progressText.textContent =
      `Hoàn tất ${totalSteps}/${totalSteps}`;

    showStatus(
      `Đã tải thành công truyện ` +
      `"${uploadData.book.title}" lên R2.`,
      'success'
    );

    summaryElement.textContent += [
      '',
      '',
      'TẢI LÊN THÀNH CÔNG',
      `Đã tải ${uploadItems.length} file truyện.`,
      'Đã cập nhật data/books.json.'
    ].join('\n');

    preparedUpload = null;
    uploadButton.disabled = true;
  } catch (error) {
    showStatus(
      error instanceof Error
        ? error.message
        : 'Không thể tải truyện lên R2.',
      'error'
    );

    progressText.textContent =
      'Quá trình tải lên chưa hoàn tất.';

    uploadButton.disabled = false;
  } finally {
    validateButton.disabled = false;
  }
}

form.addEventListener(
  'submit',
  uploadPreparedBook
);