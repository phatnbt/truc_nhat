# Kiểm thử, triển khai và rollback

## Chạy cục bộ

Cần Node 22 và Java 21 theo CI. Cài tooling trong checkout ứng dụng.

```sh
npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund firebase firebase-tools @firebase/rules-unit-testing @playwright/test
npx playwright install chromium firefox webkit
npx firebase emulators:start --only auth,firestore,hosting --project demo-p708-production-audit
```

Mở [Hosting Emulator](http://127.0.0.1:5178). Dữ liệu kiểm thử được tạo bởi bài E2E riêng; màn hình đăng nhập trống là trạng thái mặc định của room demo chưa được cấp quyền.

## Phát hành

Đợi `P708 Production QA` xanh và có phê duyệt phát hành. Đối chiếu [hướng dẫn chuyển phiên bản](MIGRATION_GUIDE.md). Chạy thủ công `Firebase Production Deploy` từ `main`. Nếu còn phục vụ qua GitHub Pages, chỉ cập nhật Pages sau khi xác nhận API runtime config có header hợp lệ. Giữ app Firebase runtime config ngoài cache và thông tin xác thực trong cơ chế secret của GitHub.

Kiểm tra App Check trên project staging ở chế độ theo dõi trước khi bật enforcement; xác minh cả origin Hosting và Pages trong Firebase Console. Role người dùng luôn kiểm tra bằng Rules. Các workflow bảo trì dữ liệu cũ có phạm vi ghi riêng; review trigger trước khi chỉnh file mà chúng theo dõi.

## Rollback

Quay lại bản Hosting đã được xác minh trong Firebase Console. Đối chiếu Rules của bản đó với schema mới và ưu tiên giữ các kiểm tra quyền an toàn. Khi cần thay đổi Rules, tạo commit khôi phục có review và triển khai có kiểm soát. Giữ toàn bộ bản ghi hiện có và xác minh quyền, kỳ đã khóa, tồn kho, đổi việc trước khi mở lại thao tác ghi. Người dùng có thể áp dụng SW mới khi không có bản nháp.

## Chi phí

Mặc định Firebase Spark, ước tính **0 đồng** khi dưới hạn mức. Firestore Standard có 50.000 lượt đọc/ngày, 20.000 ghi/ngày, 20.000 xóa/ngày và 1 GiB dữ liệu miễn phí. Listener realtime và đọc phụ của Rules được tính vào quota. Không dùng Cloud Functions, Storage, API AI hoặc dịch vụ gửi push trong luồng mặc định. Functions cũ là tùy chọn và cần review riêng trước khi bật. [Giá Firebase](https://firebase.google.com/pricing), [hạn mức Firestore](https://firebase.google.com/docs/firestore/quotas).
