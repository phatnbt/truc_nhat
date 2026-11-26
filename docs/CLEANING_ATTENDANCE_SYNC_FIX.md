# Sửa ghi trực nhật, ngày ở và đồng bộ P708

Nhánh `fix/p708-concurrent-cleaning-attendance` xuất phát từ `main` ở `c48d6ec`. Các ca thay đổi dữ liệu trong báo cáo sử dụng Firebase Emulator. Bản này chưa được triển khai production.

## Phát hiện và sửa

| Phát hiện | Nguyên nhân và module | Thay đổi | Kịch bản kiểm tra | Kết quả quan sát |
| --- | --- | --- | --- | --- |
| Thiết bị khác có thể thấy ngày ở và tiền tạm tính khác nhau | `p708-secure-sync-engine.js` trước đây chỉ ghi vào `memberData` của thành viên. Các thành viên khác chỉ đọc dữ liệu chung của phòng và bản ghi cá nhân của chính mình. | `billing-cycle-history.js` gửi đúng các ngày được chọn. Engine đọc dữ liệu mới nhất trong giao dịch, hợp nhất các ngày và công bố ngày ở trong dòng hóa đơn hiện có. Giao dịch cập nhật bản tương thích cá nhân và nhật ký cùng lần ghi. | Báo có ở với tài khoản thành viên rồi đọc dòng hóa đơn chung. Hai phiên của cùng UID sửa ngày 10 và 11 đồng thời, tiếp theo cùng bỏ chọn ngày 10. | FAIL trước sửa, dòng chung còn `false` dù UI báo thành công. PASS trên Emulator sau sửa, ngày 11 và ngày đã có được giữ lại. |
| Hàng cũ có thể hiển thị lại **Có ở** sau khi bỏ chọn | `billing-cycle-history.js` dùng khóa ngày dạng số để ghi đè cả khóa ISO đã có giá trị tường minh. | Khóa ISO ưu tiên khi đã có, kể cả `false`. Khóa số chỉ được dùng để đọc dữ liệu thiếu khóa ISO tương ứng. | Gieo hóa đơn chu kỳ với khóa số `1`, bỏ chọn ngày đầu tháng, đổi kỳ rồi quay lại. | FAIL khi Firestore đã lưu `false` nhưng nút vẫn hiện `true`. PASS sau sửa trên Chromium, gồm đổi kỳ rồi quay lại. |
| Xác nhận trực có thể làm giao diện quay về bản cũ, hoặc thao tác hoàn thành dùng dữ liệu chưa cập nhật | `p708-secure-sync-engine.js` từng áp dụng kết quả duyệt trực vào bộ nhớ mà không kiểm tra revision. Nút đánh dấu của trưởng phòng dùng luồng ghi state chung. | Duyệt và đánh dấu trực đọc lịch, người thực hiện và báo cáo theo định danh trong giao dịch. Chỉ cập nhật lịch tuần liên quan; kết quả áp dụng qua kiểm tra revision. Xác nhận trùng cùng kết quả không ghi lần nữa. | Thành viên báo, trưởng phòng yêu cầu làm lại, thành viên gửi lại, trưởng phòng duyệt, lặp duyệt, tải lại và kiểm tra EXP. Thử nút **Đánh dấu xong** trên một nhiệm vụ khác. | PASS trên Emulator. Báo chờ hoặc bị trả lại chưa tăng EXP. Sau duyệt và lặp xác nhận, tài khoản thử có 10 EXP cho nhiệm vụ đó. |
| Dọn báo trực của một tuần có thể đụng tới lịch cùng tuần vừa tạo lại | `cleaning-delete-fix.js` truyền tuần cho lệnh dọn nhưng chưa truyền ID của lịch đã xóa. | Dọn các báo cáo có đúng tuần và đúng `scheduleId` đã xóa. Cơ chế tombstone của lịch tuần giữ nguyên. | Hồi quy xóa lịch và chống phục hồi tombstone. | PASS cho hồi quy tombstone. Chưa có ca trình duyệt riêng tạo lịch mới đồng thời với lệnh dọn. |
| Giao diện có thể nhận dữ liệu chưa xác nhận | Listener phòng và dữ liệu cá nhân đọc snapshot metadata trong khi ghi. | Bỏ qua snapshot từ cache và snapshot còn `hasPendingWrites` ở nguồn xác nhận. UI báo đang lưu và chỉ báo thành công khi giao dịch trả về. Tài nguyên PWA dùng cùng version `20261127-5`. | Tắt mạng trước khi gửi ngày ở, kết nối lại, đồng bộ rồi thử lại. Chạy bài phục hồi khởi động và cập nhật PWA. | PASS cho ca mất mạng trước khi gửi và thao tác lại sau khi online. Chưa mô phỏng ngắt mạng đúng lúc máy chủ đã nhận commit. |
| Cần công bố ngày ở mà vẫn giới hạn quyền | `firestore-secure.rules` trước đây dành mọi cập nhật tài liệu phòng cho trưởng phòng. | Thành viên chỉ được công bố `days` và dấu đã công bố trên đúng dòng của mình trong kỳ mở. Quy tắc đối chiếu bản ghi cá nhân được ghi trong cùng giao dịch. Bản ghi cá nhân của người khác vẫn được bảo vệ. | Thử ghi sang dòng khác, đổi điện, đổi trạng thái người khác, thiếu ghi cá nhân, ghi vào kỳ đã chốt và đọc bản ghi cá nhân của người khác. | PASS trên Emulator. Ghi hợp lệ thành công, các ca vượt quyền bị từ chối. |

## Quy tắc dữ liệu

- Một giao dịch ngày ở lấy bản mới nhất từ Firestore và chỉ áp dụng các ngày được chọn. Hai thao tác trên hai ngày khác nhau cùng tồn tại. Với cùng một ngày, giá trị của giao dịch commit sau được giữ. Việc gửi lại cùng giá trị đã xác nhận không tạo một lần ghi mới.
- Ngày ở trong hóa đơn và trạng thái có mặt hiện tại là hai trường riêng. Quyền thành viên và trưởng phòng, phép chia tiền theo số ngày ở, biên kỳ 29–28, miễn trừ và phần dữ liệu lịch sử đã chốt dùng nghiệp vụ hiện hành.
- Khi một dòng còn dùng bản ghi ngày ở cá nhân cũ, lần ghi hợp lệ đầu tiên dùng bản đó làm nền rồi công bố vào dòng hóa đơn. Các dòng đã công bố lấy ngày ở từ tài liệu phòng. Các dòng cũ chưa chuyển có thể còn chênh lệch giữa tài khoản.
- Trạng thái công việc đã hoàn thành đến từ `assignment.completed` trong lịch Firestore. Báo cáo dựa vào UID, `memberId`, `scheduleId`, tuần và `taskId`. Tên chỉ phục vụ hiển thị. Báo cáo chờ duyệt không tính là hoàn thành.

## Kiểm thử và giới hạn

- Bộ lệnh Node trong `.github/workflows/qa.yml` đã chạy đạt, gồm hồi quy chu kỳ, tiền điện nước, trường hợp loại trừ thành viên, canonical mapping, tombstone, EXP và streak.
- Chromium và WebKit đã chạy luồng chức năng với Auth, Firestore và Hosting Emulator. Kiểm thử quy tắc Firestore đã chạy trên Emulator. Chrome và Edge cài trên Windows đã qua bộ luồng chính trước khi bổ sung ca khóa ngày kiểu cũ.
- WebKit Playwright ở độ rộng 390 px mô phỏng giao diện di động. Chưa chạy Safari trên macOS, iPhone/PWA vật lý hay Chrome Android trên thiết bị thật. Không dùng tài khoản Google thật hay ghi dữ liệu production để kiểm thử.

## Đối chiếu trước khi phát hành

```powershell
node .github/production-data-audit.mjs --attendance-dry-run
```

Lệnh chỉ đọc và tổng hợp theo kỳ. Báo cáo phân biệt dòng còn dữ liệu cá nhân cũ, bản sao cá nhân khác dòng đã công bố, dòng không khớp duy nhất và sai khác ở kỳ đã chốt. Lệnh đã chạy trên fixture Emulator riêng và xác minh revision không đổi. Chưa chạy trên production. Kết quả này là đầu vào để phê duyệt đối chiếu, không phải lệnh migration.

Nếu được phép phát hành, đối chiếu bản sao lưu và kết quả dry-run trước, rồi phát hành Firestore Rules cùng frontend. Sau phát hành cần cập nhật PWA trên các thiết bị. Bản PWA cũ vẫn có thể ghi vào luồng dữ liệu cá nhân cũ. Với dòng đã công bố, các ghi đó sẽ không ghi đè ngày ở chung của bản mới. Nếu dry-run phát hiện sai khác, cần xác định bản ghi đúng và có phương án backup, rollback trước khi chỉnh dữ liệu thật.
