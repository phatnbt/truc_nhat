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
├── functions/                  # Cloud Functions bảo mật và Streak Pet
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
- Firebase Hosting, Firestore Rules và Cloud Functions được deploy tự động khi workflow production chạy thành công.

## Bảo mật cấu hình Firebase

Firebase web config không còn được hardcode trong source GitHub. Khi chạy production trên Firebase Hosting, `src/boot/app-loader.js` lấy cấu hình runtime từ reserved endpoint `/__/firebase/init.json` rồi mới khởi tạo Firebase SDK. Service worker không chặn hoặc cache namespace `/__/`.

`P708 Production QA` chạy thêm `security-scan.test.mjs` để chặn commit có dấu hiệu chứa Google/Firebase API key, private key/service-account, GitHub token, OpenAI-style key, Slack token hoặc AWS access key.

Các credential thật như Firebase service account chỉ được dùng qua GitHub Actions Secrets. File `.env`, service-account JSON và config local đã được đưa vào `.gitignore`.

> Lưu ý: Firebase Web API key bản chất là cấu hình phía client và có thể quan sát từ trình duyệt/network khi ứng dụng chạy. Bảo mật dữ liệu phải dựa vào Firebase Authentication, Firestore Security Rules, App Check và API-key restrictions — không dựa vào việc giấu chuỗi API key.

## Tài liệu

- [Firebase Free Edition](docs/README_FREE_EDITION.md)
- [P708 Security / Architecture](docs/README_P708_SECURE.md)
- [Streak Pet](docs/STREAK_PET.md)
- [Validation metadata](docs/VALIDATION.json)
