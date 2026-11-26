# Kiểm thử hồi quy WebKit và iPhone

## Kết quả trong môi trường có sẵn

| Kịch bản | Kết quả |
| --- | --- |
| HTML/CSS và probe riêng khi tắt worker | PASS trên WebKit iPhone preset. Các bước storage, ES modules, dynamic import, SDK, Auth memory và Firestore deny-by-design có trạng thái riêng. |
| Shell tĩnh khi tắt JavaScript, sao chép báo cáo khi clipboard bị chặn | PASS trên WebKit. Link chẩn đoán hiện ngay. Báo cáo boot có mã SDK phù hợp và không chứa query callback. |
| Khởi động với worker thật, worker tối giản và worker bị chặn | PASS trên ba lượt WebKit. |
| Module pet bị chặn, thiếu `Array.at`/`Object.hasOwn` | PASS sau sửa. Màn hình đăng nhập hiện, trace có mốc thiếu phần tùy chọn. Baseline tái hiện FAIL. |
| Mất app.js hoặc mất Firebase CDN | PASS với fault injection. Có mã lỗi, link diagnostics, nút xuất báo cáo và không auto reload. |
| Khôi phục Auth, quyền, dữ liệu và offline/resume | PASS trong WebKit với Firebase Emulator. Auth popup/redirect được mô phỏng, không cần đăng nhập tài khoản thật. |
| Ngày ở, trực nhật, điện nước, EXP và stress | PASS trên Chromium/WebKit với dữ liệu Emulator. Stress test Chromium đạt 106 thao tác trên 6 tuần. |
| Production baseline mở trực tiếp, đường dẫn dấu trang, link chia sẻ và standalone giả lập | PASS đến màn hình đăng nhập trên WebKit cho bản `20261127-11`. Kết quả này dùng mạng của môi trường kiểm thử. |
| Preview HTTPS và diagnostics độc lập | PASS trên WebKit iPhone preset. Build `20261127-13` / `4e847f9`, controller đúng release, 10 tài nguyên khớp bytes gói triển khai. Các dấu xuống dòng CRLF trong gói Windows khớp với Git sau chuẩn hóa. Preview khóa dữ liệu phòng và ghi Firestore là NOT TESTED. |
| Safari macOS, iOS phiên bản cũ hoặc mới trên thiết bị thật | NOT TESTED. Môi trường Windows không có Mac hay thiết bị iPhone được nối. |
| Dấu trang, link chia sẻ, Home Screen thật, Google OAuth hoàn chỉnh, đóng app và chuyển phiên | BLOCKED cho ca iPhone gốc đến khi có thiết bị hoặc báo cáo diagnostics. |

## Progressive boot

`mobile-boot-qa.mjs` cô lập HTML, script, config/module, lưu trữ và những lỗi trước Auth. `ios-diagnostics-qa.mjs` kiểm HTML/CSS/DOM rồi từng probe đến Firestore. `mobile-auth-qa.mjs webkit` kiểm SDK/Auth restoration, room gate và lỗi quyền. `browser-qa.mjs webkit` đi tiếp từ render core đến lịch trực, hóa đơn, pet và tái kết nối. `boot-recovery.test.mjs` kiểm phạm vi worker, định danh cache và asset fallback. Workflow `P708 iOS WebKit Recovery` chạy riêng bằng Firebase Emulator.

Không suy diễn kết quả WebKit sang bản Safari trên thiết bị. Quyết định merge/deploy production phụ thuộc kết quả kiểm thử và quyền triển khai.

Hai workflow kiểm mã tại commit `4e847f9`. Production vẫn ở build `20261127-11`. [QA đầy đủ](https://github.com/phatnbt/truc_nhat/actions/runs/45881984025) · [WebKit CI](https://github.com/phatnbt/truc_nhat/actions/runs/45881984146) · [Firebase preview](https://p708-room-manager--ios-recovery-s0p96q7o.web.app/index.html?debug=1) · [Diagnostics trên preview](https://p708-room-manager--ios-recovery-s0p96q7o.web.app/ios-diagnostics.html)
