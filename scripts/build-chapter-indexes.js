const fs = require('fs');
const path = require('path');

const dataDirectory = path.join(__dirname, '..', 'public', 'data');

function findChapterFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  entries.forEach(entry => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...findChapterFiles(fullPath));
      return;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.txt') {
      files.push(fullPath);
    }
  });

  return files;
}

function readChapterTitle(filePath, chapterNumber) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
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

function buildBookIndex(bookDirectory) {
  const chapters = findChapterFiles(bookDirectory)
    .map(filePath => {
      const chapterNumber = Number(path.basename(filePath, '.txt'));

      if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) {
        return null;
      }

      return {
        number: chapterNumber,
        title: readChapterTitle(filePath, chapterNumber),
        path: path.relative(bookDirectory, filePath).split(path.sep).join('/')
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.number - second.number);

  const uniqueChapters = chapters.filter((chapter, index) => (
    index === 0 || chapter.number !== chapters[index - 1].number
  ));

  fs.writeFileSync(
    path.join(bookDirectory, 'chapters.json'),
    `${JSON.stringify(uniqueChapters, null, 2)}\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(bookDirectory, 'index.json'),
    `${JSON.stringify({
      total: uniqueChapters.length,
      firstChapter: uniqueChapters[0]?.number || 0,
      lastChapter: uniqueChapters.at(-1)?.number || 0
    }, null, 2)}\n`,
    'utf8'
  );

  return uniqueChapters.length;
}

const bookDirectories = fs.readdirSync(dataDirectory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => path.join(dataDirectory, entry.name));

bookDirectories.forEach(bookDirectory => {
  const total = buildBookIndex(bookDirectory);
  console.log(`${path.basename(bookDirectory)}: ${total} chương`);
});
