# P708 · Ma trận kiểm thử điện thoại

| Tình huống | Kết quả và phạm vi |
| --- | --- |
| Khởi động bình thường, IndexedDB Firestore cũ bị chặn xóa, lỗi nạp JS | PASS trên WebKit mô phỏng iPhone. Watchdog hiện nút thử lại và không tự reload. |
| Chẩn đoán ở standalone, LocalStorage lỗi, query OAuth giả lập | PASS trên WebKit với `navigator.standalone` giả lập. Báo cáo loại bỏ query nhạy cảm và hiện khả năng lưu trữ. |
| Redirect từ standalone cùng origin, khôi phục sau reload | PASS trên Chromium với Firebase Auth Emulator và tín hiệu standalone giả lập. |
| Google popup bị chặn/hủy, WebView, quyền bị thu hồi, đổi tài khoản, lỗi dữ liệu phòng | PASS trên Chromium, Firefox và WebKit với Auth/Firestore Emulator và lỗi mô phỏng. |
| Pagehide/pageshow và kết nối lại | PASS trên Chromium và WebKit với Firebase Emulator. Lượt quay lại đọc phòng một lần. Sau reconnect tiếp tục hiển thị dữ liệu của đúng phiên. |
| Công việc trực, duyệt, sửa ngày ở, hóa đơn, chuyển màn hình, offline | PASS trên Chromium, Firefox và WebKit trong các phiên độc lập. WebKit dùng kích thước 390 px và tín hiệu standalone giả lập. Stress test Chromium đạt 106 thao tác qua 6 tuần. |
| Nâng cấp worker, form đang nhập, giao dịch đang chờ, hai cửa sổ | PASS trên Chromium với Hosting Emulator. VM kiểm release mismatch, cache bị thiếu và việc worker mới phục vụ URL đúng bản từ cache bản liền trước. |
| Hosting preview với HTTPS, WebKit iPhone | PASS với trình duyệt mô phỏng. Kiểm build, MIME, headers, manifest, config/helper công khai và controller. Preview khóa đăng nhập và Firestore. |
| Nâng cấp cùng origin trên Firebase Hosting preview | PASS trên Chromium với kích thước điện thoại và tín hiệu standalone giả lập. Worker `20261127-11` chờ trong lúc trang `20261127-9` còn mở. Sau kích hoạt, app, loader, controller và server cùng báo `20261127-11`. Ghi nhận 0 request Auth/Firestore. |
| Đăng nhập trực tiếp từ Home Screen iPhone, Safari thực, riêng tư, khóa màn hình, terminate, cập nhật app đã cài | **NOT TESTED**. Môi trường không có iPhone vật lý hoặc remote device lab. |
| Chrome Android và PWA đã cài, 4G/5G, suspend, cập nhật khi app đã cài | **NOT TESTED**. Môi trường không có Android vật lý. |
| iPhone PWA thành viên + Android PWA trưởng phòng + desktop theo dõi đồng thời | **BLOCKED** vì thiếu hai thiết bị vật lý và kênh Firebase Auth dành cho thiết bị thử nghiệm. Ca Emulator không thay thế ca này. |
| A/B cùng thiết bị với các phương án cache, private storage, suspend và cập nhật | **NOT TESTED** trên thiết bị thật. Đã cô lập routing và lifecycle trong trình duyệt Emulator/VM. |

GitHub Actions cho commit `5a7545b` đạt QA tĩnh, Firestore Rules, mobile boot, mobile auth, Browser QA, stress test và Visual QA. [Kết quả CI](https://github.com/phatnbt/truc_nhat/actions/runs/45876868433)

## Nghiệm thu trên thiết bị thật

1. Dùng cùng URL Firebase và cùng build cho trình duyệt thường và app đã cài. Ghi model, phiên bản hệ điều hành, release của app, release worker, origin và display mode từ báo cáo chẩn đoán.
2. Đăng nhập lần đầu **từ biểu tượng đã cài** bằng tài khoản thử nghiệm. Hoàn tất Google, mở lịch trực, báo một việc, duyệt từ thiết bị khác. Đánh dấu rồi bỏ đánh dấu ngày thử nghiệm trong kỳ mở. So sánh ba màn hình với dữ liệu máy chủ đã xác nhận.
3. Khóa máy, chuyển app, đổi mạng, mở lại từ biểu tượng, đăng xuất và đổi tài khoản. Thử trong từng trạng thái trước khi bấm, lúc đang chờ và sau xác nhận. Thử lại thao tác lỗi sau khi kết nối.
4. Với hai bản staging liên tiếp, giữ bản trước đang cài, phát hành bản thử tiếp theo và so app/worker/server. Kiểm cập nhật khi không còn bản nháp và giao dịch, rồi kiểm phiên và dữ liệu. Dùng cùng tài khoản và dữ liệu tổng hợp cho các phép so browser thường, standalone, cache tối giản và storage fallback.
