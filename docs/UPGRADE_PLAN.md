# Kế hoạch nâng cấp P708

| Giai đoạn | Phạm vi trên nhánh phát triển |
| --- | --- |
| 1 | Audit baseline, khóa tự cấp admin, chặn duyệt lặp, chuyển phát hành sang thủ công. |
| 2 | Tách trạng thái giữa phiên, giao dịch cập nhật payload và đánh dấu snapshot cache. |
| 3 | Dashboard theo tài khoản, ngày phòng, số dư và chế độ tối. |
| 4 | Thuật toán có seed, xem trước/chỉnh/xác nhận, lịch phòng và trạng thái đang thực hiện. |
| 5 | Thanh toán một phần, ngày ở tại thời điểm chốt, khoản chi và vật dụng. |
| 6 | Thông báo trong ứng dụng, thông báo thiết bị tùy chọn, EXP và mục tiêu chung. |
| 7 | Đổi việc, cập nhật PWA có xác nhận, emulator, trình duyệt và tài liệu phát hành. |

Trước khi phát hành, chạy QA trên nhánh, xác minh tài khoản chính đang hoạt động, xác minh hành vi với bản sao dữ liệu đã ẩn danh và kiểm thử PWA trên iPhone. Xem [báo cáo QA](TEST_REPORT.md) và [hướng dẫn chuyển phiên bản](MIGRATION_GUIDE.md).

Các bước mở rộng tiếp theo cần thiết kế riêng gồm đính kèm ảnh có quyền theo nhiệm vụ, thông báo push từ trusted backend, và khóa dữ liệu cấp từng document con cho toàn bộ lịch sử schema 5. Hiện quyền admin vẫn ghi được payload chung của phòng. Màn hình xem trước khóa lịch ở luồng ứng dụng; các thao tác ngày ở của thành viên và trạng thái báo cáo được khóa qua Rules. Việc áp dụng đề xuất người thay thế vẫn cần trưởng phòng xử lý trong luồng phân công hoặc đổi việc.
