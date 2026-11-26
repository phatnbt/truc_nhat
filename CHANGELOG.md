# Changelog

## P708 Smart Room Manager

- Dashboard theo tài khoản với dữ liệu tuần hiện tại, số dư, có mặt, thông báo và pet.
- Tạo lịch có seed, giải thích, chỉnh bản xem trước, khóa khi xác nhận, yêu cầu đổi việc và lịch hôm nay/tuần/tháng/cá nhân.
- Checklist khi báo làm xong. Theo dõi đang thực hiện, chờ duyệt, cần làm lại, hoàn thành, quá hạn và được miễn. Lịch hiển thị tổng vệ sinh, sự kiện chung và hạn thanh toán.
- Thanh toán một phần, chốt snapshot ngày ở cho kỳ mới, biểu đồ và CSV. Ghi nhận khoản chi chung chia theo bốn cách và thống kê tồn kho.
- EXP suy ra từ nhiệm vụ đã xác nhận, cấp độ, phần trang trí và mục tiêu trực chung.
- Giới hạn quyền bootstrap, cô lập phiên, bảo toàn tombstone, cập nhật PWA có xác nhận và chạy QA với Firebase Emulator.
- Mặc định Spark. Thông báo thiết bị hoạt động trong phiên mở ứng dụng.

Xem [kết quả QA](docs/TEST_REPORT.md), [hạn chế triển khai](docs/UPGRADE_PLAN.md) và [rollback](docs/DEPLOYMENT_GUIDE.md#rollback).
