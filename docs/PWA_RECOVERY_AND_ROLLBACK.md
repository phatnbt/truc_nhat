# P708 · Khôi phục, staging và rollback

## Khôi phục trên thiết bị

- Nếu không tải được app, kiểm tra mạng và dùng **Thử lại**. Nút này mở lại HTML từ network và giữ storage dùng chung giữa các cửa sổ.
- Nếu app mở nhưng còn ở phiên bản cũ, đưa app lên foreground và đợi **Cập nhật**. Kết thúc giao dịch, lưu hoặc hủy bản nháp, đóng các cửa sổ P708 khác và bấm nút. Dùng **Tài khoản & phân quyền** và `?debug=1` để xác nhận build.
- Nếu Google mở ngoài app rồi không quay lại, kiểm hostname. Có thể cài P708 từ `p708-room-manager.firebaseapp.com` và đăng nhập **trong app mới cài**. Chờ các giao dịch hiện tại được xác nhận trước khi thay biểu tượng. Phiên của hai origin hoặc hai môi trường cài đặt có thể khác nhau.

## Staging và sản xuất

Dùng Firebase Emulator với project `demo-p708-production-audit` cho đăng nhập và nghiệp vụ bằng dữ liệu tổng hợp. Firebase Hosting preview của `p708-room-manager` có guard chỉ xem trước tài nguyên. Guard chặn khởi tạo Auth và Firestore từ hostname preview. Điều này cho phép kiểm bytes, headers, manifest, worker, build và endpoint OAuth công khai mà giữ dữ liệu phòng cách ly khỏi lượt thử.

Workflow production được chạy thủ công trên `main`. Sau khi có phê duyệt và QA, workflow sinh build metadata, triển khai, rồi so byte app.js, sw.js, manifest và metadata từ Firebase Hosting. GitHub Pages là một origin và workflow riêng. Cùng một commit không tự đồng nghĩa với cùng build đã công bố.

## Rollback

1. Đối chiếu build ID đang phục vụ, worker đang kiểm soát và bước đăng nhập bị lỗi. Trong trường hợp cần rollback, tạo commit đảo trên nhánh phát hành và gán release mới cho HTML, boot, loader và worker.
2. Chạy QA và kiểm trên staging. Phát hành qua workflow đã phê duyệt, đối chiếu tài nguyên/headers và kiểm một app đã cài chuyển từ bản cũ sang build rollback.
3. Giữ nguyên Firebase project, Rules và dữ liệu. Ca repair dữ liệu chỉ tiến hành bằng quy trình backup, dry-run và phê duyệt riêng. Hướng dẫn người dùng tải lại qua luồng cập nhật chuẩn để tránh xóa phiên hoặc giao dịch đang chờ.
