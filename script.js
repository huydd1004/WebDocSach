let currentBook = "";
let currentChapter = 1;
let totalChapters = 1;

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
      loadSelect();
    });
}

function loadChapter() {
  fetch(`data/${currentBook}/${currentChapter}.txt`)
    .then(res => res.text())
    .then(text => {
      document.getElementById("content").innerText = text;
    });
}

function loadSelect() {
  const select = document.getElementById("chapterSelect");
  for (let i = 1; i <= totalChapters; i++) {
    let opt = document.createElement("option");
    opt.value = i;
    opt.innerText = "Chương " + i;
    if (i === currentChapter) opt.selected = true;
    select.appendChild(opt);
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

function changeChapter() {
  const select = document.getElementById("chapterSelect");
  currentChapter = parseInt(select.value);
  updateURL();
}

function updateURL() {
  window.location.href = `reader.html?book=${currentBook}&chap=${currentChapter}`;
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
function loadSelect() {
  const selectTop = document.getElementById("chapterSelect");
  const selectBottom = document.getElementById("chapterSelectBottom");

  for (let i = 1; i <= totalChapters; i++) {
    const optionTop = document.createElement("option");
    optionTop.value = i;
    optionTop.innerText = "Chương " + i;
    if(i === currentChapter) optionTop.selected = true;
    selectTop.appendChild(optionTop);

    const optionBottom = document.createElement("option");
    optionBottom.value = i;
    optionBottom.innerText = "Chương " + i;
    if(i === currentChapter) optionBottom.selected = true;
    selectBottom.appendChild(optionBottom);
  }
}

// Khi chọn select ở đầu
function changeChapter() {
  const select = document.getElementById("chapterSelect");
  currentChapter = parseInt(select.value);
  updateURL();
}

// Khi chọn select ở cuối
function changeChapterBottom() {
  const select = document.getElementById("chapterSelectBottom");
  currentChapter = parseInt(select.value);
  updateURL();
}

// UPDATE URL và đồng bộ select
function updateURL() {
  window.location.href = `reader.html?book=${currentBook}&chap=${currentChapter}`;
}