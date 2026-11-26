# Chuyển phiên bản P708

1. Dùng bản sao đã ẩn danh hoặc project demo để đối chiếu danh sách thành viên, lịch đã xóa, tổng các kỳ đã chốt và ngày ở. Lưu mốc phiên bản của Hosting và commit chứa Rules đang chạy.
2. Kiểm tra `rooms/P708/security/config.adminUid` khớp một document `rooms/P708/access/{uid}` có `active=true` và `role=admin`. Từ bản này, client không tự tạo hoặc phục hồi admin chính. Room mới cần operator tạo hai document qua Firebase Console hoặc Admin SDK đáng tin cậy.
3. Giữ nguyên schema 5, `memberId`, `excludedMemberIds`, tombstone và kỳ 29–28. Không tự chạy sửa tên hoặc tái tính kỳ đã chốt khi triển khai. `closedDaysVersion=1`, `resources` và `swapRequests` được tạo khi dùng tính năng tương ứng. Client mới gửi `billingPatchMonth` khi đổi ngày ở và checklist khi báo hoàn thành lịch mới. Yêu cầu các tab cũ cập nhật trước khi tiếp tục các thao tác đó.
4. Xác minh song song hai tài khoản trên staging. Kiểm tra ngày ở đã chốt, thanh toán một phần, đổi việc, đăng xuất, và cập nhật PWA trong lúc có bản nháp.
5. Sau khi phát hành, theo dõi lỗi Rules, giao dịch xung đột, số reads/writes và kích thước document phòng.

Dữ liệu phiên cũ của ứng dụng trong localStorage không còn được dùng làm nguồn ghi. Trình duyệt có thể còn IndexedDB của release cũ nếu tab cũ đang giữ kết nối. Đóng các tab cũ, đăng xuất và xóa dữ liệu site trên thiết bị dùng chung nếu cần. Mọi dữ liệu production cần giữ được kiểm kê trực tiếp trên Firestore.

Phiên bản cũ không biết các trường mới. Khi rollback Hosting, tạm dừng các thao tác ghi mới cho đến khi xác minh bản cũ không bỏ các trường bổ sung. Bảo toàn dữ liệu Firestore và không chạy script sửa dữ liệu production khi rollback ứng dụng.
