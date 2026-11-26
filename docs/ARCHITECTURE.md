# Kiến trúc P708

`index.html → app.js → src/boot/app-loader.js → src/boot/app-start.js`. Loader nạp các hàm nghiệp vụ trong `src/core` và các script giao diện trong `src/features` theo thứ tự. Firebase Hosting cung cấp cấu hình runtime qua `/__/firebase/init.json`. GitHub Pages dùng cấu hình runtime của Firebase Hosting. Loopback dùng project demo và các emulator.

| Đường dẫn Firestore | Nội dung và quyền |
| --- | --- |
| `rooms/{roomId}` | Envelope schema 5 và revision. `payload` chứa danh sách thành viên theo `memberId`, lịch theo tuần, điện nước theo kỳ, tùy chọn và sổ vật dụng/chi chung. Thành viên đang hoạt động đọc, quản trị ghi. |
| `security/config`, `access/{uid}` | UID trưởng phòng, vai trò và ánh xạ một tài khoản đến ID nghiệp vụ. Tên không dùng làm khóa. |
| `accessRequests/{uid}` | Yêu cầu gia nhập của chính tài khoản hoặc quản trị. |
| `memberData/{uid}` | Có mặt và ngày ở do người dùng khai. Được ghép vào dữ liệu phòng theo ID nghiệp vụ. Rules chỉ cho thành viên đổi ngày ở trong một kỳ đang mở. Kỳ mới đã chốt lấy ngày ở từ snapshot của kỳ. |
| `taskSubmissions/{week}__{task}__{member}` | Đang làm, chờ duyệt, đã duyệt hoặc yêu cầu làm lại. Được xác thực theo phân công và checklist của lịch mới; quản trị duyệt. |
| `swapRequests/{id}` | Yêu cầu đổi giữa hai phân công. Khi duyệt, trạng thái yêu cầu và hai phân công đổi trong một transaction. |
| `auditLogs/{logId}` | Nhật ký theo vai trò. Quản trị xem và dọn nhật ký cũ theo rules. |

Sync engine nhận snapshot quyền trước, rồi mới gắn listener nghiệp vụ. Quyền thay đổi hoặc đăng xuất sẽ hủy listener và làm trống dữ liệu trong giao diện. Firestore dùng memory cache; mất mạng trong phiên giữ dữ liệu đã đọc và gắn trạng thái ngoại tuyến. Mở lại trang ngoại tuyến tải trang thông báo mất mạng từ service worker.

Admin ghi payload trong transaction trên dữ liệu vừa đọc. Transaction ghép các thay đổi từ trạng thái trước và thay cả trường `payload` để khóa đã xóa không bị giữ lại. Tạo lại tuần đã xóa kiểm tra tombstone rồi thay lịch và bỏ tombstone trong cùng transaction. Sổ chi/tồn kho vào cùng giao dịch khi mua. Duyệt task ghi cả báo cáo lẫn phân công. EXP đọc từ tập duy nhất tuần, việc và thành viên đã xác nhận.

Rules của schema 5 bảo vệ ranh giới quyền phòng, UID và trạng thái báo cáo. Quy tắc cho mọi trường con động của payload quản trị vẫn phụ thuộc validation giao dịch của ứng dụng. Khi số bản ghi tăng, tách sổ chi, công việc và kỳ mới thành các document có giới hạn; giữ nguyên bản ghi lịch sử khi chuyển.
