# P708 Real-time Sync — cách chạy

## 1. Thành phần

- `P708_Firestore_Fixed.html`: giao diện gốc đã thay lõi Google Apps Script polling bằng Firestore real-time.
- `p708-sync-engine.js`: listener real-time, transaction chống lost update và IndexedDB outbox cho offline.
- `firestore.rules`: rules tối thiểu cho phòng P708.

## 2. Tạo Firebase project

1. Tạo Firebase project.
2. Bật **Cloud Firestore**.
3. Bật **Authentication → Sign-in method → Anonymous**.
4. Tạo Web App và sao chép `firebaseConfig`.
5. Mở `P708_Firestore_Fixed.html`, tìm `FIREBASE_CONFIG`, thay toàn bộ giá trị `REPLACE_...`.
6. Dán nội dung `firestore.rules` vào Firestore Rules rồi Publish.

## 3. Chạy đúng cách

Không mở trực tiếp bằng `file://` vì ES module thường bị trình duyệt chặn. Chạy bằng một web server, Firebase Hosting, Vercel, Netlify hoặc GitHub Pages.

Ví dụ local:

```bash
python -m http.server 8080
```

Sau đó mở `http://localhost:8080/P708_Firestore_Fixed.html`.

## 4. Cơ chế chống xung đột

- Mỗi thao tác được chuyển thành patch theo đường dẫn dữ liệu.
- Patch được lưu vào IndexedDB trước khi gửi.
- Firestore transaction đọc revision mới nhất rồi áp patch lên dữ liệu mới nhất.
- Hai thiết bị sửa hai trường khác nhau: cả hai thay đổi được giữ lại.
- Hai thiết bị sửa cùng một trường: transaction commit sau cùng thắng (Last-Write-Wins theo thứ tự máy chủ, không phụ thuộc đồng hồ thiết bị).
- Patch là idempotent, nên retry sau lỗi mạng không nhân đôi dữ liệu.

## 5. Lưu ý production

Rules hiện tại chỉ yêu cầu người dùng đã đăng nhập ẩn danh và giới hạn document `P708`. Anonymous Auth không phải cơ chế phân quyền mạnh. Khi triển khai thật, nên thêm danh sách UID thành viên phòng hoặc custom claims/App Check.

Document Firestore hiện lưu toàn bộ phòng trong một document. Với quy mô P708 hiện tại là phù hợp. Nếu lịch sử tăng lớn gần giới hạn document, tách `schedules` và `billingMonths` thành subcollection.
