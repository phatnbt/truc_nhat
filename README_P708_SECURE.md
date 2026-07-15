# P708 Secure — phân quyền theo tài khoản Google

## Những gì đã nâng cấp

- Đăng nhập bằng Google thay cho Anonymous Authentication.
- Người đầu tiên thiết lập phòng sẽ nhận quyền **Trưởng phòng**.
- Thành viên mới gửi yêu cầu tham gia; trưởng phòng duyệt và liên kết tài khoản với đúng tên trong phòng.
- Thành viên thường chỉ được sửa:
  - Trạng thái Có mặt/Vắng của chính mình.
  - Các ngày ở của chính mình trong bảng điện nước.
- Trưởng phòng được thêm/xóa thành viên, tạo/chỉnh lịch, nhập hóa đơn, chốt sổ và quản lý quyền.
- Nút của người khác bị khóa cả ở giao diện lẫn Firestore Security Rules.
- Xác nhận trước khi đánh dấu Vắng hoặc xóa nhiều ngày.
- Có nút **Hoàn tác** trong 8,5 giây sau các thay đổi dễ nhấn nhầm.
- Có nhật ký thay đổi dành cho trưởng phòng.
- Dữ liệu cá nhân được tách vào `rooms/P708/memberData/{uid}` để Rules chặn sửa chéo tài khoản.

## 1. Bật đăng nhập Google

Firebase Console → **Xác thực** → **Phương thức kết nối** → **Google** → Bật → chọn email hỗ trợ → Lưu.

Anonymous có thể để bật hoặc tắt. Bản Secure không sử dụng Anonymous.

## 2. Thay Firestore Rules

Firebase Console → **Cửa hàng lửa / Firestore** → **Quy tắc**.

Xóa rules cũ, dán toàn bộ nội dung file `firestore-secure.rules`, sau đó bấm **Xuất bản**.

Rules cũ chỉ kiểm tra `request.auth != null` và không đủ an toàn. Bắt buộc dùng rules mới cùng bản Secure.

## 3. Chạy thử trên máy

Đặt hai file cùng thư mục:

```text
index.html
p708-secure-sync-engine.js
```

Mở CMD trong thư mục đó:

```bash
py -m http.server 8080
```

Truy cập:

```text
http://localhost:8080/
```

## 4. Thiết lập trưởng phòng lần đầu

1. Mở website và đăng nhập Google bằng tài khoản trưởng phòng.
2. Khi thấy màn hình “Thiết lập trưởng phòng đầu tiên”, bấm **Nhận quyền trưởng phòng**.
3. Thực hiện bước này trước khi chia link cho người khác.
4. Vào nút tài khoản ở góc trên bên phải.
5. Tại “Tài khoản đã cấp quyền”, liên kết tài khoản trưởng phòng với đúng tên thành viên nếu cần.

## 5. Duyệt thành viên

Quy trình của thành viên:

1. Mở cùng đường link.
2. Đăng nhập Google.
3. Nhập tên trong phòng và gửi yêu cầu.

Quy trình của trưởng phòng:

1. Bấm nút tài khoản ở góc trên bên phải.
2. Trong “Yêu cầu đang chờ”, chọn đúng tên thành viên.
3. Chọn vai trò **Thành viên**.
4. Bấm **Duyệt**.

Sau khi duyệt, trang của thành viên sẽ tự mở. Người đó chỉ có thể sửa dữ liệu gắn với tên đã liên kết.

## 6. Đưa lên Firebase Hosting

Gói này đã có cấu trúc:

```text
public/
  index.html
  p708-secure-sync-engine.js
firebase.json
firestore-secure.rules
```

Nếu đã cài Firebase CLI:

```bash
firebase login
firebase use p708-room-manager
firebase deploy --only hosting,firestore:rules
```

Nếu dùng tên miền riêng, thêm tên miền đó tại Firebase Authentication → Settings → Authorized domains.

## Mô hình dữ liệu

```text
rooms/P708                          # dữ liệu chung, chỉ admin được ghi
rooms/P708/security/config          # UID trưởng phòng đầu tiên
rooms/P708/access/{uid}             # vai trò + memberId được liên kết
rooms/P708/accessRequests/{uid}     # yêu cầu tham gia
rooms/P708/memberData/{uid}         # có mặt + ngày ở của đúng tài khoản
rooms/P708/auditLogs/{logId}        # nhật ký thao tác
```

## Lưu ý chuyển đổi từ bản cũ

- Dữ liệu chung cũ tại `rooms/P708` vẫn được đọc lại.
- Khi trưởng phòng đăng nhập lần đầu, bản Secure sẽ tiếp tục dùng payload hiện có.
- Nếu Firestore chưa có dữ liệu nhưng máy trưởng phòng còn dữ liệu local, ứng dụng sẽ khởi tạo dữ liệu phòng từ máy đó.
- Không tiếp tục phát hành file cũ dùng `p708-sync-engine.js`, vì file đó không có phân quyền theo thành viên.
