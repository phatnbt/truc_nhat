# Firebase App Check cho P708 (Spark / Free)

P708 đã có lớp bootstrap App Check chạy trước Firestore/Auth. Code dùng reCAPTCHA v3 vì không hiển thị CAPTCHA cho người dùng và phù hợp web app hiện tại.

## 1. Tạo reCAPTCHA v3 key

- Đăng ký domain production `p708-room-manager.web.app` (và domain riêng nếu có) trong reCAPTCHA v3.
- Lấy **Site key** và **Secret key**.

## 2. Đăng ký app trong Firebase App Check

Firebase Console → **Security → App Check → Apps** → chọn web app P708 → reCAPTCHA v3 → nhập **Secret key**.

## 3. Gắn Site key vào frontend

Mở `app-check-config.js` và điền Site key public:

```js
export const APP_CHECK_SITE_KEY = "YOUR_RECAPTCHA_V3_SITE_KEY";
```

Không đưa Secret key vào GitHub/frontend.

## 4. Deploy Hosting

```powershell
git pull origin main
firebase deploy --only hosting
```

## 5. Kiểm tra metrics trước khi Enforce

Mở Firebase Console → Security → App Check → Firestore và kiểm tra request Verified/Unverified. Dùng app thật trên điện thoại và desktop trước khi bật enforcement.

## 6. Bật enforcement

Khi request hợp lệ đã được xác minh, chọn **Cloud Firestore → Enforce** trong App Check. Sau khi bật, request không có App Check token hợp lệ sẽ bị từ chối.

> Nếu chạy localhost sau khi bật enforcement, dùng App Check debug provider/token theo tài liệu Firebase thay vì tắt App Check ở production.
