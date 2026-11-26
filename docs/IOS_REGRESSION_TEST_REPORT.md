# Kiểm thử hồi quy WebKit và iPhone

## Kết quả trong môi trường có sẵn

| Kịch bản | Kết quả |
| --- | --- |
| HTML/CSS và probe riêng khi tắt worker | PASS trên WebKit iPhone preset. Các bước storage, ES modules, dynamic import, SDK, Auth memory và Firestore deny-by-design có trạng thái riêng. |
| Khởi động với worker thật, worker tối giản và worker bị chặn | PASS trên ba lượt WebKit. |
| Module pet bị chặn, thiếu `Array.at`/`Object.hasOwn` | PASS sau sửa. Màn hình đăng nhập hiện, trace có mốc thiếu phần tùy chọn. Baseline tái hiện FAIL. |
| Mất app.js hoặc mất Firebase CDN | PASS với fault injection. Có mã lỗi, link diagnostics, nút xuất báo cáo và không auto reload. |
| Khôi phục Auth, quyền, dữ liệu và offline/resume | PASS trong WebKit với Firebase Emulator. Auth popup/redirect được mô phỏng, không cần đăng nhập tài khoản thật. |
| Ngày ở, trực nhật, điện nước, EXP và stress | Kiểm bằng workflow QA và Auth/Firestore Emulator, với dữ liệu tổng hợp. |
| Safari macOS, iOS phiên bản cũ hoặc mới trên thiết bị thật | NOT TESTED. Môi trường Windows không có Mac hay thiết bị iPhone được nối. |
| Dấu trang, link chia sẻ, Home Screen thật, Google OAuth hoàn chỉnh, đóng app và chuyển phiên | BLOCKED cho ca iPhone gốc đến khi có thiết bị hoặc báo cáo diagnostics. |

## Progressive boot

`mobile-boot-qa.mjs` cô lập HTML, script, config/module, lưu trữ và những lỗi trước Auth. `ios-diagnostics-qa.mjs` kiểm HTML/CSS/DOM rồi từng probe đến Firestore. `mobile-auth-qa.mjs webkit` kiểm SDK/Auth restoration, room gate và lỗi quyền. `browser-qa.mjs webkit` đi tiếp từ render core đến lịch trực, hóa đơn, pet và tái kết nối. `boot-recovery.test.mjs` kiểm phạm vi worker, định danh cache và asset fallback. Workflow `P708 iOS WebKit Recovery` chạy riêng bằng Firebase Emulator.

Không suy diễn kết quả WebKit sang bản Safari trên thiết bị. Quyết định merge/deploy production phụ thuộc kết quả kiểm thử và quyền triển khai.
