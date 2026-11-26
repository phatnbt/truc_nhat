# Hai lỗi bootstrap P708 tái hiện được trên WebKit

| Triệu chứng thử nghiệm | Tầng đầu tiên thất bại | Vị trí và nguyên nhân | Thay đổi |
| --- | --- | --- | --- |
| Khi một request vườn pet bị chặn, giao diện hiện **Chưa thể mở P708** trước màn hình đăng nhập. | 5 · Tải script | `src/boot/app-loader.js` dùng cùng `Promise.all` cho pet, các tính năng trình bày và core. Một `script.onerror` làm cả bootstrap bị reject. | Tách hai nhóm. Khởi tạo storage adapter, core, Firebase và Auth trước khi tải phần phụ. Phần phụ lỗi lưu mốc trace và core vẫn hoạt động. |
| Khi WebKit thiếu `Array.prototype.at` và `Object.hasOwn`, cold boot rơi vào trang khôi phục. | 7 · Khởi tạo render | `home-enhancements.js` bọc `renderHome` và gọi `.sort().at(-1)` ngay cả khi chưa có hóa đơn. `app-render.js` cũng dùng `.at` trên đường render lịch. `Object.hasOwn` làm các đường bấm nút và hóa đơn phụ thuộc thêm vào API Safari 15.4. | Dùng chỉ số mảng hoặc `.pop()`, dùng `hasOwnProperty.call`, và gọi hook trình bày trong error boundary. |
| Khi chặn tệp Firebase SDK, người dùng trước đây chỉ nhận lỗi chung ở boot. | 8 · SDK | Static imports của loader được đánh giá trước khi tải config và trước khi đăng ký mốc SDK. | Config tải trước. Loader import nhóm SDK trong hàm async, có mốc và mã `sdk-dependencies`. HTML hiển thị bước lỗi và sao chép trace. |

Hai ca đầu thất bại trên baseline production được chạy bằng WebKit và fault injection. Ca chặn pet trả “Chưa thể mở P708” trước bước Auth. Ca thiếu built-in hiện nút thử lại. Sau bản sửa, cùng cấu hình vào Google sign-in entry và ghi trace từ HTML đến APP_READY. Không sử dụng chúng để quy kết mạng, storage hoặc Safari trên chiếc iPhone thực tế khi chưa có báo cáo thiết bị.

## Các giả thuyết còn lại

HTTP/TLS, MIME, bytes tài nguyên và cấu hình public của endpoint production đều qua trong lần đo. Chưa thấy bằng chứng chính sách OAuth, staging, trình bày CSS hay Service Worker là điểm đầu tiên thất bại trong hai ca tái hiện mới. Boot vẫn qua khi loại bỏ worker hoặc dùng worker tối giản. WebKit có lịch sử lỗi top-level `await`, nên app entry và loader mới đưa async vào hàm rõ ràng. Đây là giảm phụ thuộc tương thích, không phải một lỗi riêng đã đóng trên thiết bị.

Bản vá trước giải quyết xác thực, đồng bộ và cache. Nhóm pet/chart vẫn nằm trên đường bắt buộc và lỗi trong wrapper render có thể xảy ra trước khi Firebase Auth được gọi. Endpoint chẩn đoán mới không chạy đường đó.

[Kiểm thử và giới hạn](IOS_REGRESSION_TEST_REPORT.md) · [Hướng dẫn xuất báo cáo](IOS_DIAGNOSTICS_GUIDE.md)
