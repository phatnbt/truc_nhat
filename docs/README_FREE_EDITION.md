# P708 Free Edition (Firebase Spark)

Bản này không dùng Cloud Functions và không yêu cầu nâng project lên Blaze.

> Đây là phương án giới hạn. Streak Pet có kiểm tra server và các thao tác Admin SDK không hoạt động trong phương án này. Cấu hình production hiện tại có Functions; nếu muốn dùng Spark-only phải bỏ riêng mục `functions` khi deploy/cấu hình một biến thể Firebase khác.

## Deploy

```powershell
git pull origin main
firebase use p708-room-manager
firebase deploy --only hosting,firestore:rules
```

## Chức năng quản trị miễn phí

- Dashboard trưởng phòng.
- Lịch trực, thành viên báo hoàn thành và trưởng phòng xác nhận.
- Điện nước + đã đóng/chưa đóng.
- Nhật ký và dọn log cũ hơn 30 ngày trực tiếp qua Firestore Rules.
- **Xóa khỏi phòng**: xóa quyền truy cập, email và dữ liệu tài khoản trong Firestore; xóa task submission của tài khoản; gỡ email khỏi audit log.

## Giới hạn của Spark

Trình duyệt không được cấp Firebase Admin SDK, vì vậy nút **Xóa khỏi phòng** không thể xóa tài khoản của người khác khỏi Firebase Authentication.

Nếu cần xóa luôn tài khoản Auth: Firebase Console → Authentication → Users → chọn người dùng → Delete user.

Lệnh deploy phía trên chỉ chọn Hosting và Rules nên không triển khai thư mục `functions/`.
