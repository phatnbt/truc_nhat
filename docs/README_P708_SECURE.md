# P708 Manager v5 — quản lý phòng + bảo mật tài khoản

## Nâng cấp chính

- Dashboard dành cho trưởng phòng: số người có mặt, tiến độ trực, số tiền còn phải thu, yêu cầu chờ xử lý.
- Thành viên có thể **Báo đã làm** công việc của chính mình; trưởng phòng **Xác nhận** hoặc **Yêu cầu làm lại**.
- Thuật toán phân công tiếp tục cân bằng điểm lịch sử và ưu tiên tránh giao cùng một việc hai tuần liên tiếp.
- Bảng điện nước có trạng thái **Đã đóng / Chưa đóng**, số đã thu và số còn thiếu.
- Nhắc việc bằng Browser Notification khi người dùng mở/refresh ứng dụng và đã cấp quyền thông báo.
- Nhật ký chỉ trưởng phòng xem; có nút dọn các log **cũ hơn 30 ngày**.
- Quản trị tài khoản có nút **Xóa hoàn toàn**: xóa quyền, memberData, access request, task submissions, audit log của tài khoản và xóa luôn Firebase Authentication của dự án.
- Code giao diện được tách thành `index.html`, `styles.css`, `app.js`, `p708-secure-sync-engine.js`.

## Lưu ý quan trọng về “xóa email hoàn toàn”

Nút **Xóa hoàn toàn** xóa tài khoản người khác khỏi Firebase Authentication của project P708 và xóa các document tài khoản chứa email/UID trong Firestore. Tên lịch sử trong lịch trực/hóa đơn vẫn được giữ để không làm sai dữ liệu sổ cũ. Không thể dùng nút này để xóa tài khoản trưởng phòng chính hoặc tài khoản đang đăng nhập.

## Chính sách nhật ký 30 ngày

- Log mới hơn 30 ngày được giữ để truy vết.
- Trưởng phòng có nút **Dọn log >30 ngày**.
- Browser không có quyền xóa audit log trực tiếp. Việc dọn log chạy qua Cloud Function có quyền Admin SDK để tránh thành viên hoặc mã client sửa/xóa log gần đây.

## Firestore / Authentication

Bật Google Sign-In trong Firebase Authentication và triển khai `firestore-secure.rules`.

Mô hình dữ liệu:

```text
rooms/P708
rooms/P708/security/config
rooms/P708/access/{uid}
rooms/P708/accessRequests/{uid}
rooms/P708/memberData/{uid}
rooms/P708/taskSubmissions/{submissionId}
rooms/P708/auditLogs/{logId}
```

## Cloud Functions

Hai callable functions mới:

- `deleteP708Account`: xóa hoàn toàn tài khoản người khác khỏi hệ thống P708.
- `cleanupP708AuditLogs`: xóa audit log cũ hơn thời gian lưu trữ, tối thiểu 30 ngày.

Project dùng Node.js 22.

> Cloud Functions cần project Firebase ở gói hỗ trợ triển khai Functions (thường là Blaze). Nếu chưa nâng gói, phần Dashboard/lịch/điện nước vẫn hoạt động nhưng hai thao tác server-side “Xóa hoàn toàn” và “Dọn log >30 ngày” sẽ chưa chạy được.

## Deploy

```bash
npm install -g firebase-tools
firebase login
firebase use p708-room-manager
cd functions && npm install && cd ..
firebase deploy --only hosting,firestore:rules,functions
```

Hosting hiện dùng thư mục root (`"public": "."`) và đã ignore `functions/**`, rules, README và các file cấu hình. Việc này sửa lỗi cấu hình cũ trỏ vào thư mục `public/` trong khi repo không có thư mục đó.

## Kiểm tra trước khi chia link

1. Đăng nhập tài khoản trưởng phòng trước và nhận quyền trưởng phòng.
2. Tạo ít nhất một thành viên rồi duyệt một tài khoản member thử nghiệm.
3. Kiểm tra member chỉ sửa được presence/ngày ở của chính mình.
4. Tạo lịch, member bấm “Tôi đã làm”, admin xác nhận.
5. Chốt một tháng điện nước và thử nút “Đã thu tiền”.
6. Chỉ thử “Xóa hoàn toàn” bằng một tài khoản test, không dùng tài khoản thật ngay lần đầu.
