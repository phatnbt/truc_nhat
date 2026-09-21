# Streak Pet

## Cách tích hợp

Streak Pet dùng nguyên Firebase Authentication, Firestore và giao diện JavaScript hiện có. Hoạt động hợp lệ để nhận XP là **thành viên báo hoàn thành một công việc được phân công cho chính mình trong ngày**.

Client chỉ gửi yêu cầu điểm danh đã xác thực. Callable Cloud Function tự lấy UID từ Firebase Auth, đọc quyền/phân công/bản ghi báo hoàn thành và tính ngày tại server theo `Asia/Ho_Chi_Minh`. Client không được gửi ngày, XP hoặc streak.

Mỗi ngày một tài khoản nhận tối đa 20 XP và tăng streak một lần. Nếu ngày điểm danh gần nhất không phải hôm qua thì streak kế tiếp bắt đầu lại từ 1; tổng XP và các dạng đã mở khóa không giảm.

## Dữ liệu Firestore

- `rooms/P708/petProfiles/{uid}`: XP, streak hiện tại/cao nhất, ngày điểm danh cuối và các dạng đã mở khóa.
- `rooms/P708/petCheckins/{uid}_{YYYY-MM-DD}`: bản ghi duy nhất cho tài khoản và ngày tại Việt Nam.

Firestore không cần migration schema. Hai collection được tạo lười trong transaction đầu tiên và không sửa/xóa dữ liệu hiện có. ID xác định theo UID + ngày cùng transaction Firestore bảo đảm idempotency khi retry hoặc có nhiều request đồng thời.

Firestore Rules chỉ cho chủ tài khoản và quản trị viên đọc dữ liệu thú; mọi ghi trực tiếp từ client bị chặn. Chỉ Admin SDK trong Cloud Functions được ghi.

## Tiến hóa

| Dạng | Ngưỡng XP | Asset |
| --- | ---: | --- |
| Mầm Mây | 0 | `icons/pets/cloud-sprout.svg` |
| Mèo Mây | 100 | `icons/pets/cloud-cat.svg` |
| Hộ Vệ Mây | 300 | `icons/pets/cloud-guardian.svg` |
| Thiên Vân | 700 | `icons/pets/cloud-celestial.svg` |

Các asset SVG riêng dùng CSS animation để giữ website tĩnh nhẹ và không thêm runtime Rive/Lottie vào kiến trúc hiện tại.

## Triển khai

Không có migration thủ công. Cần triển khai đồng thời Functions, Rules và Hosting:

```bash
cd functions
npm ci
cd ..
firebase deploy --only functions,firestore:rules,hosting
```

Project Firebase phải hỗ trợ Cloud Functions và runtime Node.js 22. Frontend không cần biến môi trường mới, không dùng service-role/service-account key. Workflow GitHub hiện dùng secret sẵn có `FIREBASE_SERVICE_ACCOUNT_P708_ROOM_MANAGER` để deploy; không đưa giá trị secret vào repository.

## Kiểm thử

Kiểm tra tĩnh và logic giao diện:

```bash
node .github/validate.mjs
node .github/cleaning-streak.test.mjs
node .github/pet-widget-ui.test.mjs
```

Cài dependency QA ở thư mục gốc rồi chạy Rules và transaction trên Firestore Emulator (Java 21+):

```bash
npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund firebase firebase-tools @firebase/rules-unit-testing
npx firebase-tools emulators:exec --only firestore --project demo-p708-production-audit "node .github/rules.test.mjs && node .github/pet-checkin.test.mjs"
```

Bộ transaction test bao phủ điểm danh lần đầu, điểm danh trùng, ngày kế tiếp, bỏ lỡ ngày, giữ XP/tiến hóa, đúng bốn ngưỡng, hai request đồng thời và tài khoản không có quyền.

Kiểm thử tay: đăng nhập bằng tài khoản thành viên, báo hoàn thành đúng công việc được phân công, mở widget thú và xác nhận nhận 20 XP. Bấm thử lại phải hiện đã điểm danh và XP không đổi. Kiểm tra widget ở chiều rộng desktop và mobile.
