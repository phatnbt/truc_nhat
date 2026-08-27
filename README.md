# P708 Room Manager

Ứng dụng quản lý phòng P708: lịch trực nhật, ngày ở, điện nước, thanh toán, phân quyền và đồng bộ realtime bằng Firebase.

## Cấu trúc repository

```text
.
├── app.js                      # Bootstrap duy nhất ở root
├── src/
│   ├── boot/                   # Loader + khởi động ứng dụng
│   ├── core/                   # State/core + Firebase sync engine
│   └── features/               # Cleaning, billing, dashboard, UI enhancements
├── icons/                      # PWA icons
├── functions/                  # Cloud Functions tham khảo/tùy chọn
├── docs/                       # Tài liệu và validation metadata
├── .github/                    # QA tests + workflows
├── index.html
├── styles.css / landing-ui.css # CSS runtime giữ ở root để không đổi URL hiện tại
├── manifest.webmanifest
├── sw.js
├── firebase.json
└── firestore-secure.rules
```

## Quy tắc tổ chức

- Không thêm file `app-*.js` mới ở root, trừ `app.js` bootstrap.
- Logic khởi động đặt trong `src/boot`.
- Core/state/realtime đặt trong `src/core`.
- Logic tính năng và enhancement đặt trong `src/features`.
- Tài liệu không dùng khi chạy production đặt trong `docs`.
- Mọi thay đổi vào `main` phải qua workflow `P708 Production QA`.
- Firebase Hosting và Firestore Rules được deploy tự động khi workflow production chạy thành công.

## Tài liệu

- [Firebase Free Edition](docs/README_FREE_EDITION.md)
- [P708 Security / Architecture](docs/README_P708_SECURE.md)
- [Validation metadata](docs/VALIDATION.json)
