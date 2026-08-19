# P708 Free Edition (Firebase Spark)

Bản này không dùng Cloud Functions và không yêu cầu nâng project lên Blaze.

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

Thư mục `functions/` được giữ lại làm mã tham khảo nhưng `firebase.json` Free Edition không cấu hình Functions, vì vậy `firebase deploy` sẽ không cố triển khai Functions.
