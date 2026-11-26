# Kiểm tra hệ thống P708

Baseline `f99b4f0`. Phạm vi là source, cấu hình, workflow và kiểm thử trên checkout riêng. Dữ liệu thật không được truy cập.

Graphify quét 65 tệp mã ở baseline, cho ra 630 nút và 997 cạnh. Các tuyến nhân quả chính đi qua `app-core1.js` (state), `app-core2.js` (tuần tự hóa), `app-actions1.js` (thao tác trực) và `p708-secure-sync-engine.js` (giao dịch/realtime). Chạy `graphify . --code-only` tại baseline để tái tạo bản đồ. Rules, workflow và tệp cấu hình được rà soát riêng vì đồ thị code không đủ để kết luận về quyền hoặc triển khai.

| Mức | Phát hiện | Khu vực |
| --- | --- | --- |
| Critical | Người dùng đăng nhập có thể tự tạo cấu hình trưởng phòng khi config vắng. Cần cấp quyền ban đầu qua kênh quản trị. | `firestore-secure.rules`, auth gate, sync engine |
| High | Quyền trưởng phòng chính trong rules bỏ qua trạng thái active, và client tự bật lại quyền. | Rules, auth listener |
| High | Rules cho phép quản trị viên duyệt lại báo cáo sau khi trạng thái đã kết thúc. | `taskSubmissions` |
| High | Firestore merge lồng nhau giữ lại khóa đã xóa. Snapshot từ cache có thể kích hoạt ghi lại trạng thái khởi tạo. | `recordShape`, room listener |
| High | Bản ghi ngày ở theo UID đè lên kỳ đã khóa trong lớp overlay. Việc chuyển dữ liệu ngày ở lúc chốt cần kiểm tra thay đổi đồng thời. | `memberData`, billing |
| High | Workflow triển khai chạy độc lập với QA. Một số workflow bảo trì ghi dữ liệu thật được kích hoạt bằng push. | `.github/workflows` |
| Medium | Lịch tự động bị định nghĩa hai lần, có thể ghi đè lịch đang có tiến độ. Lịch và nhắc việc phụ thuộc ngày giờ thiết bị. | Cleaning actions, fairness, notifications |
| Medium | Lịch đang chọn chi phối thống kê tuần; dashboard tính toàn bộ khoản phải thu khi đã nhận một phần. | Dashboard, billing |
| Medium | Service worker dùng mọi cache cùng origin để tìm tài nguyên, và khi kích hoạt xóa cả cache thuộc ứng dụng khác. | `sw.js` |
| Low | Có shim tương thích và các lớp render ghi đè nhau. Cần giữ các regression test khi gộp các đường gọi. | `src/features`, root compatibility shim |

Xem [kiến trúc](ARCHITECTURE.md) để biết luồng đọc, ghi và ranh giới tin cậy; xem [kiểm thử](TEST_REPORT.md) để biết phần đã xác minh.
