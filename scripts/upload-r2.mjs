import {
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

import {
  readFile,
  readdir
} from 'node:fs/promises';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

const projectRoot = path.resolve(
  scriptDirectory,
  '..'
);

const environmentPath = path.join(
  projectRoot,
  '.env.r2.local'
);

function parseEnvironmentFile(content) {
  const values = {};

  content.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      return;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = line
      .slice(0, separatorIndex)
      .trim();

    let value = line
      .slice(separatorIndex + 1)
      .trim();

    const hasDoubleQuotes =
      value.startsWith('"') &&
      value.endsWith('"');

    const hasSingleQuotes =
      value.startsWith("'") &&
      value.endsWith("'");

    if (hasDoubleQuotes || hasSingleQuotes) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  });

  return values;
}

function getContentType(filePath) {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  const contentTypes = {
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };

  return contentTypes[extension] ||
    'application/octet-stream';
}

async function collectFiles(
  directory,
  sourceDirectory,
  objectPrefix
) {
  const entries = await readdir(directory, {
    withFileTypes: true
  });

  entries.sort((first, second) =>
    first.name.localeCompare(
      second.name,
      'vi'
    )
  );

  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      const nestedFiles = await collectFiles(
        absolutePath,
        sourceDirectory,
        objectPrefix
      );

      files.push(...nestedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = path
      .relative(sourceDirectory, absolutePath)
      .split(path.sep)
      .join('/');

    const key = [
      objectPrefix,
      relativePath
    ]
      .filter(Boolean)
      .join('/');

    files.push({
      absolutePath,
      key
    });
  }

  return files;
}

async function runUploadPool(
  files,
  uploadFile,
  concurrency = 8
) {
  let nextIndex = 0;
  let completed = 0;

  const failures = [];

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= files.length) {
        return;
      }

      const file = files[currentIndex];

      try {
        await uploadFile(file);
      } catch (error) {
        failures.push({
          key: file.key,
          message:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }

      completed += 1;

      if (
        completed === 1 ||
        completed % 25 === 0 ||
        completed === files.length
      ) {
        console.log(
          `Đã xử lý ${completed}/${files.length} file`
        );
      }
    }
  }

  const workerCount = Math.min(
    concurrency,
    files.length
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => runWorker()
    )
  );

  return failures;
}

const commandArguments = process.argv.slice(2);
const dryRun = commandArguments.includes('--dry-run');

const argumentsWithoutOptions =
  commandArguments.filter(
    argument => argument !== '--dry-run'
  );

const [
  sourceArgument,
  prefixArgument
] = argumentsWithoutOptions;

if (!sourceArgument || !prefixArgument) {
  console.error(
    'Cách dùng: node scripts/upload-r2.mjs ' +
    '<thư-mục-nguồn> <đường-dẫn-R2> [--dry-run]'
  );

  process.exit(1);
}

const environmentContent = await readFile(
  environmentPath,
  'utf8'
);

const environment = parseEnvironmentFile(
  environmentContent
);

const requiredVariables = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME'
];

const missingVariables =
  requiredVariables.filter(
    key => !environment[key]
  );

if (missingVariables.length > 0) {
  console.error(
    `Thiếu biến: ${missingVariables.join(', ')}`
  );

  process.exit(1);
}

const sourceDirectory = path.resolve(
  projectRoot,
  sourceArgument
);

const objectPrefix = prefixArgument
  .replace(/^\/+/, '')
  .replace(/\/+$/, '');

const files = await collectFiles(
  sourceDirectory,
  sourceDirectory,
  objectPrefix
);

console.log(`Nguồn: ${sourceDirectory}`);
console.log(`Đích R2: ${objectPrefix}`);
console.log(`Số file: ${files.length}`);

if (dryRun) {
  console.log('\nMười file đầu tiên:');

  files.slice(0, 10).forEach(file => {
    console.log(`- ${file.key}`);
  });

  console.log(
    '\nChạy thử hoàn tất, chưa tải file lên R2.'
  );

  process.exit(0);
}

const client = new S3Client({
  region: 'auto',
  endpoint: environment.R2_ENDPOINT
    .replace(/\/+$/, ''),
  credentials: {
    accessKeyId:
      environment.R2_ACCESS_KEY_ID,
    secretAccessKey:
      environment.R2_SECRET_ACCESS_KEY
  }
});

async function uploadFile(file) {
  const body = await readFile(
    file.absolutePath
  );

  await client.send(
    new PutObjectCommand({
      Bucket: environment.R2_BUCKET_NAME,
      Key: file.key,
      Body: body,
      ContentType: getContentType(
        file.absolutePath
      ),
      CacheControl:
        'public, max-age=300'
    })
  );
}

const failures = await runUploadPool(
  files,
  uploadFile
);

if (failures.length > 0) {
  console.error(
    `\nCó ${failures.length} file tải thất bại:`
  );

  failures.slice(0, 20).forEach(failure => {
    console.error(
      `- ${failure.key}: ${failure.message}`
    );
  });

  process.exit(1);
}

console.log(
  `\nĐã tải thành công ${files.length} file lên R2.`
);