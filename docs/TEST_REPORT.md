# Báo cáo QA P708

Ngày 26/11/2026. Baseline `f99b4f0`, nhánh `upgrade/p708-smart-room`. Môi trường Windows, Node 24, Java 21 và Firebase Emulator project `demo-p708-production-audit`. CI cấu hình Node 22.

| Hạng mục | Kết quả quan sát |
| --- | --- |
| Baseline | 17 script hồi quy ngoài emulation, static validator và Firestore Rules emulator đã chạy thành công. |
| Hồi quy Node | 17 script và static validator chạy thành công sau các giai đoạn code. Gồm canonical ID, dữ liệu trùng, xóa lịch/tombstone, kỳ 29–28, bù vắng, seed và làm tròn VND. |
| Firestore Rules | PASS. Kiểm tra phân quyền, tự nâng quyền, truy cập phòng khác, ghi ngày ở kỳ khóa và chọn đúng phân công. Hai transaction đồng thời trên cùng một báo cáo chỉ ghi thành công một lần. |
| Chromium (1280 px) | PASS. Hai tài khoản, nhiều timezone, checklist, duyệt, đổi việc, EXP sau reload, chốt sổ, thanh toán một phần, mua vật dụng và đăng xuất. Chuyển phiên bản SW, chặn cập nhật khi đang nhập và reload ngoại tuyến rồi kết nối lại đều qua. |
| WebKit (390 px) | PASS cho các luồng nghiệp vụ trên. Dùng bàn phím cho một số nút trong danh sách cuộn ở bài test. SDK có hai cảnh báo đường truyền đến Firestore Emulator cục bộ; giao dịch và kiểm tra dữ liệu sau ghi đều qua. Các kiểm tra cài đặt và cập nhật PWA trên iPhone vẫn cần thiết bị thật. |
| Firefox | BLOCKED trên máy Windows này. Firefox của Playwright 1.65.1 bị `Target crashed` cả khi mở trang trống, với lỗi `RenderCompositorSWGL`. Thử engine 146 của Playwright 1.58.2 cũng không mở được trang trong phiên kiểm tra. CI Linux vẫn bao gồm Firefox. |
| OAuth Google thật | Chưa chạy. E2E đăng nhập tài khoản thử bằng Auth Emulator và kiểm tra giao diện sau đăng nhập. |
| iPhone thật | Chưa chạy. Cần kiểm tra cài vào Màn hình chính, quyền thông báo, trạng thái đóng ứng dụng, xoay màn hình và bàn phím iOS. |
| Dữ liệu staging/production | Chưa đối chiếu dữ liệu thật. Kiểm thử dùng fixture trong project demo. |

## Chạy lại

```sh
node .github/validate.mjs
npx firebase emulators:exec --only firestore --project demo-p708-production-audit "node .github/rules.test.mjs"
npx firebase emulators:exec --only auth,firestore,hosting --project demo-p708-production-audit "node .github/browser-qa.mjs"
```

Có thể thêm tên trình duyệt ở cuối lệnh `node .github/browser-qa.mjs` để chạy riêng một engine. Ảnh Playwright được lưu trong `test-results/`.
