# Đăng nhập di động và PWA của P708

Bản sửa nằm trên nhánh `fix/p708-mobile-auth-pwa`, tách từ bản production `c48d6ec`. Các thử nghiệm đăng nhập có tài khoản dùng Firebase Auth Emulator. Không có thay đổi cấu hình OAuth, Firestore Rules hay dữ liệu production.

## Các lỗi và thay đổi

| Phát hiện | Nguyên nhân và file | Sửa và cách kiểm tra |
| --- | --- | --- |
| Trình duyệt tích hợp vẫn mời đăng nhập Google | `p708-secure-sync-engine.js` và `app-core2.js` chưa phân biệt trình duyệt nhúng với Safari hoặc Chrome. Google có thể chặn tương tác OAuth trong WebView. | `mobile-auth-policy.js` nhận diện các dấu hiệu Zalo, Messenger, Facebook và Android WebView. Hiện hướng dẫn mở trình duyệt ngoài và nút sao chép link. Nếu Clipboard bị từ chối, hiện ô link để sao chép thủ công. |
| Trạng thái đăng nhập có thể hiển thị sai trong lúc xử lý redirect | Trình theo dõi phiên có thể cập nhật giao diện trước khi kết quả redirect sẵn sàng. Đồng thời, callback tiến độ của script cuối có thể ghi đè màn hình khôi phục phiên. | Engine chờ phiên Firebase và kết quả redirect trước khi công bố trạng thái đầu tiên. Giao diện xóa dấu tiến độ sau khi nhận trạng thái Auth. Kiểm thử cố ý giữ kết quả redirect và kiểm tra nút Google chưa xuất hiện. |
| Có quyền nhưng màn hình trống hoặc chờ dữ liệu lâu | UI mở phòng ngay khi nhận access. Lỗi listener phòng không được hiển thị ở cổng đăng nhập. | Chờ cả thông tin quyền và snapshot phòng/cá nhân từ máy chủ. Phân biệt đang kiểm tra, chờ duyệt, bị khóa, đang tải, mất mạng và lỗi dữ liệu. **Thử lại** đăng ký lại listener, giữ phiên Google. Dashboard và điều hướng bị vô hiệu hóa bằng `inert` khi chưa sẵn sàng. |
| Thay tài khoản hoặc cập nhật liên kết có thể giữ trạng thái cũ | Engine trước đây khởi động lại listener phòng khi đổi vai trò nhưng chưa theo dõi đổi `memberId` cùng vai trò. Module toàn vẹn còn ghi state phòng vào LocalStorage dù app không dùng để khôi phục. | Tái khởi tạo dữ liệu khi đổi UID, vai trò hoặc `memberId`. Callback thuộc phiên/listener cũ bị bỏ qua. Bỏ ghi toàn bộ state phòng vào LocalStorage và dọn các khóa snapshot phòng cũ lúc khởi động. Firebase SDK tiếp tục quản lý phiên Auth. |
| Popup bị chặn, hủy hoặc lỗi mạng thiếu đường thử lại rõ ràng | Luồng cũ dùng thông báo lỗi SDK thô và không có trạng thái bấm đang xử lý. | Mobile và standalone dùng redirect trên tên miền Firebase đã đăng ký. Desktop dùng popup. Nếu popup bị chặn, chỉ chuyển sang redirect một lần. Lỗi và hủy cho phép bấm lại. Các mã Auth thông dụng có thông báo tiếng Việt. |
| Tài nguyên Auth khác bản có thể dùng bản cache đã cũ | Service worker bỏ query phiên bản trước khi dò cache. | Đồng bộ bản `20261127-6`. Asset Auth yêu cầu build khác đi thẳng qua mạng. Firebase `/__/auth/` và `/__/firebase/` vẫn nằm ngoài bộ xử lý cache. Nút cập nhật PWA tránh kích hoạt giữa luồng xác thực. |

Các file chính gồm `app.js`, `index.html`, `sw.js`, `src/boot/app-loader.js`, `src/boot/app-start.js`, `src/core/app-core2.js`, `src/core/mobile-auth-policy.js`, `src/core/p708-secure-sync-engine.js` và `src/features/app-integrity-fixes.js`. Không thay đổi giao diện các module nghiệp vụ, manifest hay quyền truy cập.

## Cấu hình và nguồn tham khảo

Kiểm tra chỉ đọc trên production cho thấy hai endpoint `/__/firebase/init.json` trả project `p708-room-manager` và `authDomain` là `p708-room-manager.firebaseapp.com`. HTTPS `/__/auth/handler` trả 200 trên hai tên miền Firebase. Endpoint cấu hình công khai Identity Toolkit trả 200 với Referer Firebase chính và xác nhận `p708-room-manager.firebaseapp.com`, `p708-room-manager.web.app` và `phatnbt.github.io` trong danh sách được phép. Đây là bằng chứng kết nối chỉ đọc, chưa xác minh trọn vẹn đăng nhập production bằng tài khoản thật.

Firebase khuyến nghị cấu hình redirect và persistence bằng SDK. Bản sửa ưu tiên LocalStorage rồi IndexedDB, SessionStorage và bộ nhớ. Trình duyệt có thể tách phiên Safari khỏi PWA đã cài. [Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin) · [Redirect](https://firebase.google.com/docs/auth/web/redirect-best-practices) · [Persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) · [Khởi tạo Auth](https://firebase.google.com/docs/auth/web/custom-dependencies) · [Chính sách WebView của Google](https://developers.google.com/identity/protocols/oauth2/policies)

Đối chiếu các mẫu [Firebase Quickstart](https://github.com/firebase/quickstart-js), [Firebase SDK](https://github.com/firebase/firebase-js-sdk), [Firebase Testing](https://github.com/firebase/quickstart-testing) và [Playwright](https://github.com/microsoft/playwright). URL PWA Compat được nêu trong yêu cầu trả 404 khi kiểm tra.

Chưa thấy thiếu authorized domain trong danh sách được đọc. Nếu production báo lỗi OAuth, kiểm tra **Firebase Console → Authentication → Settings → Authorized domains**, **Sign-in method → Google** và **Google Cloud Console → Google Auth Platform → Clients**. URI cần đối chiếu là `https://p708-room-manager.firebaseapp.com/__/auth/handler`. Kiểm tra API key trong **APIs & Services → Credentials** nếu Firebase trả lỗi hạn chế theo referrer. Kiểm tra lại bằng Safari và Chrome trên thiết bị sau khi có thay đổi được phê duyệt.

## Kiểm thử và giới hạn

- Regression chuyên biệt nằm ở `.github/mobile-auth-qa.mjs` và chạy trong workflow QA. Các nhánh đóng popup, popup bị chặn và lỗi redirect tải lại dùng giả lập kết quả API. Ca redirect thành công đi qua trình xử lý Google của Firebase Auth Emulator và quay lại ứng dụng.
- Kiểm thử tích hợp gồm tài khoản chờ duyệt, tài khoản bị khóa, lỗi đọc tài liệu phòng và thử lại, khôi phục sau refresh, chuyển offline rồi online, đổi tài khoản và xác nhận dữ liệu phòng không được lưu lại trong LocalStorage. Bộ hồi quy PWA kiểm tra watchdog, thử lại và service worker.
- Playwright và UA giả lập không xác minh iPhone vật lý, Android vật lý, Samsung Internet thật hoặc Zalo/Messenger/Facebook thật. Chưa xác minh token bị thu hồi bởi Identity Toolkit production, hoặc phiên tiếp tục qua Safari và Home Screen của thiết bị thật. Trình duyệt nhúng chỉ được hỗ trợ bằng hướng dẫn mở ngoài.

## Rollback

Production đang giữ bản trước. Nếu bản này được phát hành và cần rollback, tạo commit revert phần thay đổi đăng nhập trên `main`, dùng định danh cache mới cho bản revert và redeploy các host hiện có. Kiểm tra lại link Firebase, callback Auth và trạng thái đã đăng nhập sau khi người dùng cập nhật PWA. Không cần khôi phục hoặc chỉnh dữ liệu phòng cho rollback này.
