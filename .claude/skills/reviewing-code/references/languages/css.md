# CSS / Less / Sass

Dùng khi review code CSS và code bộ tiền xử lý Less, Sass: biến, `!important`, hiệu năng, responsive, tương thích trình duyệt, lồng selector và mixin.

## Biến CSS thay cho giá trị viết cứng

### Khi nào phải dùng biến

```css
/* ❌ Viết cứng: khó bảo trì */
.button {
  background: #3b82f6;
  border-radius: 8px;
}
.card {
  border: 1px solid #3b82f6;
  border-radius: 8px;
}

/* ✅ Dùng biến CSS */
:root {
  --color-primary: #3b82f6;
  --radius-md: 8px;
}
.button {
  background: var(--color-primary);
  border-radius: var(--radius-md);
}
.card {
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
}
```

### Quy ước đặt tên biến

```css
/* Cách nhóm biến khuyến nghị */
:root {
  /* Màu */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-text: #1f2937;
  --color-text-muted: #6b7280;
  --color-bg: #ffffff;
  --color-border: #e5e7eb;

  /* Khoảng cách */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Chữ */
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-weight-normal: 400;
  --font-weight-bold: 700;

  /* Bo góc */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Bóng */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);

  /* Transition */
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
}
```

### Phạm vi biến

```css
/* ✅ Biến cấp component: giảm ô nhiễm toàn cục */
.card {
  --card-padding: var(--spacing-md);
  --card-radius: var(--radius-md);

  padding: var(--card-padding);
  border-radius: var(--card-radius);
}

/* ⚠️ Tránh dùng JS đổi biến liên tục: ảnh hưởng hiệu năng */
```

### Câu hỏi review

- Giá trị màu có dùng biến không?
- Khoảng cách có lấy từ design system không?
- Giá trị lặp lại đã tách thành biến chưa?
- Tên biến có mang ngữ nghĩa không?

## Quy tắc dùng `!important`

### Khi được dùng

```css
/* ✅ Utility class: cần ghi đè rõ ràng */
.hidden { display: none !important; }
.sr-only { position: absolute !important; }

/* ✅ Ghi đè style thư viện bên thứ ba (khi không sửa được code) */
.third-party-modal {
  z-index: 9999 !important;
}

/* ✅ Style khi in */
@media print {
  .no-print { display: none !important; }
}
```

### Khi bị cấm

```css
/* ❌ Dùng để giải quyết specificity: nên viết lại selector */
.button {
  background: blue !important;  /* vì sao cần !important? */
}

/* ❌ Ghi đè style do chính mình viết */
.card { padding: 20px; }
.card { padding: 30px !important; }  /* sửa thẳng quy tắc gốc */

/* ❌ Trong style của component */
.my-component .title {
  font-size: 24px !important;  /* phá vỡ đóng gói component */
}
```

### Cách thay thế

```css
/* Vấn đề: cần ghi đè style của .btn */

/* ❌ Dùng !important */
.my-btn {
  background: red !important;
}

/* ✅ Tăng specificity */
button.my-btn {
  background: red;
}

/* ✅ Dùng selector cụ thể hơn */
.container .my-btn {
  background: red;
}

/* ✅ Dùng :where() để hạ specificity của style bị ghi đè */
:where(.btn) {
  background: blue;  /* specificity bằng 0 */
}
.my-btn {
  background: red;   /* ghi đè bình thường */
}
```

### Mẫu nhận xét review

```markdown
P1 🔴 "Có 15 chỗ !important, giải thích lý do cần cho từng chỗ"
P2 🟡 "!important này giải quyết được bằng cách chỉnh specificity của selector"
💡 "Cân nhắc dùng CSS Layers (@layer) để quản lý độ ưu tiên style"
```

## Hiệu năng

### P1 🔴 Vấn đề hiệu năng mức cao

#### 1. `transition: all`

```css
/* ❌ Tốn hiệu năng: trình duyệt kiểm tra mọi thuộc tính animate được */
.button {
  transition: all 0.3s ease;
}

/* ✅ Chỉ định rõ thuộc tính */
.button {
  transition: background-color 0.3s ease, transform 0.3s ease;
}

/* ✅ Nhiều thuộc tính thì dùng biến */
.button {
  --transition-duration: 0.3s;
  transition:
    background-color var(--transition-duration) ease,
    box-shadow var(--transition-duration) ease,
    transform var(--transition-duration) ease;
}
```

#### 2. Animate `box-shadow`

```css
/* ❌ Mỗi frame đều repaint: ảnh hưởng nặng tới hiệu năng */
.card {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: box-shadow 0.3s ease;
}
.card:hover {
  box-shadow: 0 8px 16px rgba(0,0,0,0.2);
}

/* ✅ Dùng pseudo-element + opacity */
.card {
  position: relative;
}
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: 0 8px 16px rgba(0,0,0,0.2);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  border-radius: inherit;
}
.card:hover::after {
  opacity: 1;
}
```

#### 3. Thuộc tính kích hoạt layout (reflow)

```css
/* ❌ Animate các thuộc tính này làm tính lại layout */
.bad-animation {
  transition: width 0.3s, height 0.3s, top 0.3s, left 0.3s, margin 0.3s;
}

/* ✅ Chỉ animate transform và opacity (chỉ kích hoạt composite) */
.good-animation {
  transition: transform 0.3s, opacity 0.3s;
}

/* Dịch chuyển dùng translate thay cho top/left */
.move {
  transform: translateX(100px);  /* ✅ */
  /* left: 100px; */             /* ❌ */
}

/* Phóng to dùng scale thay cho width/height */
.grow {
  transform: scale(1.1);  /* ✅ */
  /* width: 110%; */      /* ❌ */
}
```

### P2 🟡 Vấn đề hiệu năng mức trung bình

#### Selector phức tạp

```css
/* ❌ Lồng quá sâu: so khớp selector chậm */
.page .container .content .article .section .paragraph span {
  color: red;
}

/* ✅ Làm phẳng */
.article-text {
  color: red;
}

/* ❌ Universal selector và selector thuộc tính */
* { box-sizing: border-box; }           /* tác động mọi phần tử */
[class*="icon-"] { display: inline; }   /* selector thuộc tính chậm hơn */

/* ✅ Giới hạn phạm vi */
.icon-box * { box-sizing: border-box; }
```

#### Nhiều bóng và filter

```css
/* ⚠️ Bóng phức tạp ảnh hưởng hiệu năng render */
.heavy-shadow {
  box-shadow:
    0 1px 2px rgba(0,0,0,0.1),
    0 2px 4px rgba(0,0,0,0.1),
    0 4px 8px rgba(0,0,0,0.1),
    0 8px 16px rgba(0,0,0,0.1),
    0 16px 32px rgba(0,0,0,0.1);  /* 5 lớp bóng */
}

/* ⚠️ Filter tốn GPU */
.blur-heavy {
  filter: blur(20px) brightness(1.2) contrast(1.1);
  backdrop-filter: blur(10px);  /* càng tốn hơn */
}
```

### Gợi ý tối ưu

```css
/* Dùng will-change báo trước cho trình duyệt (dùng thận trọng) */
.animated-element {
  will-change: transform, opacity;
}

/* Bỏ will-change sau khi animation xong */
.animated-element.idle {
  will-change: auto;
}

/* Dùng contain để giới hạn vùng repaint */
.card {
  contain: layout paint;  /* báo trình duyệt thay đổi bên trong không ảnh hưởng bên ngoài */
}
```

### Câu hỏi review

- Có dùng `transition: all` không?
- Có animate width/height/top/left không?
- `box-shadow` có bị animate không?
- Selector có lồng quá 3 cấp không?
- Có `will-change` thừa không?

## Responsive

### Nguyên tắc Mobile First

```css
/* ✅ Mobile First: style gốc dành cho di động */
.container {
  padding: 16px;
  display: flex;
  flex-direction: column;
}

/* Tăng dần cho màn hình lớn */
@media (min-width: 768px) {
  .container {
    padding: 24px;
    flex-direction: row;
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 32px;
    max-width: 1200px;
    margin: 0 auto;
  }
}

/* ❌ Desktop First: phải ghi đè nhiều style hơn */
.container {
  max-width: 1200px;
  padding: 32px;
  flex-direction: row;
}

@media (max-width: 1023px) {
  .container {
    padding: 24px;
  }
}

@media (max-width: 767px) {
  .container {
    padding: 16px;
    flex-direction: column;
    max-width: none;
  }
}
```

### Breakpoint

```css
/* Breakpoint khuyến nghị (dựa trên nội dung, không dựa trên thiết bị) */
:root {
  --breakpoint-sm: 640px;   /* điện thoại lớn */
  --breakpoint-md: 768px;   /* máy tính bảng dọc */
  --breakpoint-lg: 1024px;  /* máy tính bảng ngang/laptop nhỏ */
  --breakpoint-xl: 1280px;  /* desktop */
  --breakpoint-2xl: 1536px; /* desktop lớn */
}

/* Ví dụ dùng */
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
```

### Câu hỏi review responsive

- Có theo Mobile First không?
- Breakpoint có đặt theo điểm vỡ của nội dung thay vì theo thiết bị không?
- Có tránh được breakpoint chồng nhau không?
- Chữ có dùng đơn vị tương đối (rem/em) không?
- Vùng chạm có đủ lớn (từ 44px trở lên) không?
- Đã test khi xoay ngang/dọc chưa?

### Lỗi thường gặp

```css
/* ❌ Chiều rộng cố định */
.container {
  width: 1200px;
}

/* ✅ Chiều rộng tối đa + co giãn */
.container {
  width: 100%;
  max-width: 1200px;
  padding-inline: 16px;
}

/* ❌ Khung chữ chiều cao cố định */
.text-box {
  height: 100px;  /* chữ có thể tràn */
}

/* ✅ Chiều cao tối thiểu */
.text-box {
  min-height: 100px;
}

/* ❌ Vùng chạm nhỏ */
.small-button {
  padding: 4px 8px;  /* quá nhỏ, khó bấm */
}

/* ✅ Vùng chạm đủ rộng */
.touch-button {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 16px;
}
```

## Tương thích trình duyệt

### Tính năng cần kiểm tra

| Tính năng | Hỗ trợ | Khuyến nghị |
|---|---|---|
| CSS Grid | Trình duyệt hiện đại ✅ | IE cần Autoprefixer + test |
| Flexbox | Hỗ trợ rộng ✅ | Bản cũ cần prefix |
| CSS Variables | Trình duyệt hiện đại ✅ | IE không hỗ trợ, cần giá trị dự phòng |
| `gap` (flexbox) | Khá mới ⚠️ | Safari 14.1+ |
| `:has()` | Khá mới ⚠️ | Firefox 121+ |
| `container queries` | Khá mới ⚠️ | Trình duyệt ra sau năm 2023 |
| `@layer` | Khá mới ⚠️ | Kiểm tra trình duyệt mục tiêu |

### Chiến lược dự phòng

```css
/* Dự phòng cho biến CSS */
.button {
  background: #3b82f6;              /* giá trị dự phòng */
  background: var(--color-primary); /* trình duyệt hiện đại */
}

/* Dự phòng cho gap của flexbox */
.flex-container {
  display: flex;
  gap: 16px;
}
/* Dự phòng cho trình duyệt cũ */
.flex-container > * + * {
  margin-left: 16px;
}

/* Dự phòng cho Grid */
.grid {
  display: flex;
  flex-wrap: wrap;
}
@supports (display: grid) {
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
}
```

### Cấu hình Autoprefixer

```javascript
// postcss.config.js
module.exports = {
  plugins: [
    require('autoprefixer')({
      // theo cấu hình browserslist
      grid: 'autoplace',  // bật prefix cho Grid (hỗ trợ IE)
      flexbox: 'no-2009', // chỉ dùng cú pháp flexbox hiện đại
    }),
  ],
};

// package.json
{
  "browserslist": [
    "> 1%",
    "last 2 versions",
    "not dead",
    "not ie 11"  // tùy yêu cầu dự án
  ]
}
```

### Câu hỏi review

- Đã tra [Can I Use](https://caniuse.com) chưa?
- Tính năng mới có phương án dự phòng không?
- Đã cấu hình Autoprefixer chưa?
- browserslist có khớp yêu cầu dự án không?
- Đã test trên trình duyệt mục tiêu chưa?

## Vấn đề riêng của Less / Sass

### Độ sâu lồng

```scss
/* ❌ Lồng quá sâu: selector sau biên dịch quá dài */
.page {
  .container {
    .content {
      .article {
        .title {
          color: red;  // biên dịch thành .page .container .content .article .title
        }
      }
    }
  }
}

/* ✅ Tối đa 3 cấp */
.article {
  &__title {
    color: red;
  }

  &__content {
    p { margin-bottom: 1em; }
  }
}
```

### Mixin, Extend hay biến

```scss
@use 'sass:color';

/* Biến: cho một giá trị đơn */
$primary-color: #3b82f6;

/* Mixin: cho khối code có tham số */
@mixin button-variant($bg, $text) {
  background: $bg;
  color: $text;
  &:hover {
    // Dart Sass đã bỏ darken()/lighten() toàn cục, dùng module color
    background: color.adjust($bg, $lightness: -10%);
    // color.scale($bg, $lightness: -10%) chỉnh theo tỉ lệ, chuyển đậm nhạt tự nhiên hơn
  }
}

/* Extend: cho style giống hệt nhau (dùng thận trọng) */
%visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);  /* clip: rect() đã lỗi thời, dùng clip-path */
  white-space: nowrap;    /* tránh nội dung bị dồn thành một cột rồi đẩy vỡ layout */
}

.sr-only {
  @extend %visually-hidden;
}

/* ⚠️ Vấn đề của @extend */
// có thể sinh tổ hợp selector ngoài ý muốn
// không dùng được trong @media
// ưu tiên mixin
```

### Câu hỏi review

- Lồng có quá 3 cấp không?
- Có lạm dụng `@extend` không?
- Mixin có quá phức tạp không?
- Kích thước CSS sau biên dịch có hợp lý không?

## Công cụ

| Công cụ | Dùng để |
|---|---|
| [Stylelint](https://stylelint.io/) | Kiểm tra code CSS |
| [PurgeCSS](https://purgecss.com/) | Xóa CSS không dùng |
| [Autoprefixer](https://autoprefixer.github.io/) | Tự thêm prefix |
| [CSS Stats](https://cssstats.com/) | Thống kê CSS |
| [Can I Use](https://caniuse.com/) | Tra tương thích trình duyệt |

## Tài liệu chính thức

- [CSS Performance Optimization (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS)
- [Media Query Fundamentals (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Media_queries)

## Checklist

### P1 🔴 Phải sửa

- [ ] `transition: all`
- [ ] Animate width/height/top/left/margin
- [ ] Nhiều `!important`
- [ ] Màu/khoảng cách viết cứng lặp lại hơn 3 lần
- [ ] Selector lồng hơn 4 cấp

### P2 🟡 Nên sửa

- [ ] Thiếu xử lý responsive
- [ ] Dùng Desktop First
- [ ] Animate `box-shadow` phức tạp
- [ ] Thiếu dự phòng tương thích trình duyệt
- [ ] Phạm vi biến CSS quá rộng

### P3 🟢 Gợi ý tối ưu

- [ ] Dùng CSS Grid để đơn giản layout
- [ ] Dùng biến CSS để tách giá trị lặp
- [ ] Dùng `@layer` để quản lý độ ưu tiên
- [ ] Thêm `contain` để tối ưu hiệu năng
