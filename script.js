let currentBook = "";
let currentChapter = 1;
let totalChapters = 1;
const CHAPTERS_PER_PART = 200; // số chương trong 1 phần

// LOAD DANH SÁCH TRUYỆN
if (document.getElementById("book-list")) {
  fetch("data/books.json")
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("book-list");

      data.forEach(book => {
        const div = document.createElement("div");
        div.className = "book";

        div.innerHTML = `
          <img src="${book.cover}">
          <div class="book-info">
            <h3>${book.title}</h3>
            <p>${book.author}</p>
            <p>${book.status}</p>
            <p>${book.date}</p>
          </div>
        `;

        div.onclick = () => {
          window.location.href = `reader.html?book=${book.id}&chap=1`;
        };

        container.appendChild(div);
      });
    });
}

// LOAD TRUYỆN
if (document.getElementById("content")) {
  const url = new URLSearchParams(window.location.search);
  currentBook = url.get("book");
  currentChapter = parseInt(url.get("chap"));

  fetch(`data/${currentBook}/index.json`)
    .then(res => res.json())
    .then(data => {
      totalChapters = data.total;
      loadChapter();
      loadSelects();
    });
}

function loadChapter() {
  fetch(`data/${currentBook}/${currentChapter}.txt`)
    .then(res => res.text())
    .then(text => {
      document.getElementById("content").innerText = text;
    });
}

// Tính phần (1-based) cho chương
function chapterToPart(chap) {
  return Math.floor((chap - 1) / CHAPTERS_PER_PART) + 1;
}

// Tính range chương của phần
function partRange(part) {
  const start = (part - 1) * CHAPTERS_PER_PART + 1;
  const end = Math.min(part * CHAPTERS_PER_PART, totalChapters);
  return { start, end };
}

// Load cả select phần và select chương (top & bottom)
function loadSelects() {
  const partTop = document.getElementById("partSelect");
  const selectTop = document.getElementById("chapterSelect");
  const selectBottom = document.getElementById("chapterSelectBottom");

  // xóa nội dung cũ nếu có
  [partTop, selectTop, selectBottom].forEach(el => { if (el) el.innerHTML = ""; });

  const totalParts = Math.max(1, Math.ceil(totalChapters / CHAPTERS_PER_PART));
  const currentPart = chapterToPart(currentChapter);

  // phần select (chỉ cần 1 select ở trên)
  for (let p = 1; p <= totalParts; p++) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.innerText = "Phần " + p;
    if (p === currentPart) opt.selected = true;
    partTop.appendChild(opt);
  }

  // fill chapters for currentPart
  const range = partRange(currentPart);
  for (let i = range.start; i <= range.end; i++) {
    const o1 = document.createElement("option");
    o1.value = i;
    o1.innerText = "Chương " + i;
    if (i === currentChapter) o1.selected = true;
    selectTop.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = i;
    o2.innerText = "Chương " + i;
    if (i === currentChapter) o2.selected = true;
    selectBottom.appendChild(o2);
  }
}

// NAVIGATION
function nextChapter() {
  if (currentChapter < totalChapters) {
    currentChapter++;
    updateURL();
  }
}

function prevChapter() {
  if (currentChapter > 1) {
    currentChapter--;
    updateURL();
  }
}

function firstChapter() {
  currentChapter = 1;
  updateURL();
}

function lastChapter() {
  currentChapter = totalChapters;
  updateURL();
}


function goHome() {
  window.location.href = "index.html";
}

// SETTINGS
function toggleSettings() {
  document.getElementById("settings").classList.toggle("hidden");
}

function applySettings() {
  const bg = document.getElementById("bgColor").value;
  const text = document.getElementById("textColor").value;

  document.body.style.background = bg;
  document.body.style.color = text;
}
// =======================
// THEME & FONT SIZE CHỈ TRONG TRANG ĐỌC
// =======================

// Theme cố định
const themes = [
  { bg: "#0f172a", text: "#e2e8f0" }, // Dark
  { bg: "#fdf6e3", text: "#222222" }, // Light
  { bg: "#fff8dc", text: "#5b4636" }  // Sepia
];

// Chỉ load theme & font nếu có div #content (trang đọc)
window.addEventListener("load", () => {
  const content = document.getElementById("content");
  if(!content) return; // Nếu không có content, thoát, không áp dụng gì

  const savedTheme = localStorage.getItem("theme");
  const savedFont = localStorage.getItem("fontsize");

  if(savedTheme !== null) applyTheme(parseInt(savedTheme));
  if(savedFont !== null) applyFontSize(savedFont);
});

// Áp dụng theme và lưu
function applyTheme(index) {
  const content = document.getElementById("content");
  if(!content) return; // Chỉ áp dụng nếu đang đọc truyện

  const theme = themes[index];
  document.body.style.background = theme.bg;
  document.body.style.color = theme.text;

  content.style.background = index === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  localStorage.setItem("theme", index); // lưu theme

  toggleSettings(); // tự đóng bảng setting
}

// Áp dụng font size và lưu
function applyFontSize(size) {
  const content = document.getElementById("content");
  if(!content) return; // Chỉ áp dụng nếu đang đọc truyện

  switch(size) {
    case 'small':
      content.style.fontSize = "16px";
      content.style.lineHeight = "1.6";
      break;
    case 'medium':
      content.style.fontSize = "20px";
      content.style.lineHeight = "2";
      break;
    case 'large':
      content.style.fontSize = "24px";
      content.style.lineHeight = "2.2";
      break;
  }

  localStorage.setItem("fontsize", size); // lưu cỡ chữ

  toggleSettings(); // tự đóng bảng setting
}

// LOAD SELECT BOX
// Khi user chọn 1 phần
function changePart() {
  const partSel = document.getElementById("partSelect");
  const selectedPart = parseInt(partSel.value);
  // chuyển chương hiện tại về chương đầu của phần
  const { start } = partRange(selectedPart);
  currentChapter = start;
  updateURL();
}

// Khi chọn select ở đầu
// Khi chọn chương ở trên
function changeChapter() {
  const select = document.getElementById("chapterSelect");
  currentChapter = parseInt(select.value);
  updateURL();
}

// Khi chọn select ở cuối
// Khi chọn chương ở dưới
function changeChapterBottom() {
  const select = document.getElementById("chapterSelectBottom");
  currentChapter = parseInt(select.value);
  updateURL();
}

// UPDATE URL và đồng bộ select
function updateURL() {
  window.location.href = `reader.html?book=${currentBook}&chap=${currentChapter}`;
}