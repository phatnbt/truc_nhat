# P708 · Sửa lỗi hoàn thành trực nhật

Nhánh `fix/critical-cleaning-completion`, tách từ `main` tại `79fb3f3`. Các bằng chứng dưới đây dùng tài khoản và dữ liệu tổng hợp trong Firebase Emulator.

## Tái hiện và nguyên nhân

| Mã | Thao tác tái hiện | Trước khi sửa | Sau khi sửa |
| --- | --- | --- | --- |
| `CRIT-stale-cleanup` | Thành viên gửi checklist Lavabo. Khi báo cáo đang chờ, trưởng phòng chạy dọn báo cáo với danh sách phân công cũ rỗng. | `reconcileTaskSubmissions` so báo cáo với danh sách phía trình duyệt, rồi xóa theo lô. Assertion `a stale repair roster must not delete a valid report` thất bại với `1 !== 0`. | Giao dịch đọc lại lịch và báo cáo trên máy chủ. Xóa 0 tài liệu. Đọc từ Firestore vẫn thấy `submitted`. |
| `CRIT-stale-review` | Trưởng phòng mở thao tác duyệt, báo cáo được yêu cầu làm lại, thành viên nộp lại cùng việc, rồi lệnh duyệt của lần nộp trước đến. | ID báo cáo được dùng lại khi nộp lại. `reviewTask` chỉ xét ID và trạng thái hiện tại nên duyệt nhầm lần nộp mới. Assertion `Missing expected rejection` tái hiện lỗi khi chạy ca này riêng. | Giao dịch từ chối mốc `submittedAt` cũ. Đọc từ Firestore thấy lần nộp mới vẫn `submitted`. Nút duyệt ở lần hiển thị mới xác nhận được. |

Tài liệu báo cáo của hai ca là `rooms/P708/taskSubmissions/<tuần>__lavabo__b`. Giá trị `b` và tuần được tạo trong fixture. Log QA chỉ in mã ca, trạng thái và số đếm.

## Đường đi của dữ liệu

1. `bindStaticEvents` trong `src/boot/app-start.js` bắt sự kiện theo bảng lịch và đối chiếu khóa công việc đã hiển thị. `openChecklist` và `confirmChecklist` trong `src/features/app-actions1.js` giữ UID, memberId, scheduleId và taskId của bản nháp. Bấm xác nhận checklist gửi đúng việc và chờ kết quả giao dịch mới báo thành công.
2. `submitTask` trong `src/core/p708-secure-sync-engine.js` từng chỉ đọc báo cáo trước khi gửi, còn điều kiện phân công do Firestore Rules kiểm tra lúc ghi. Giao dịch hiện cũng đọc lịch máy chủ và kiểm tra đúng phiên, tuần, lịch, nhiệm vụ, thành viên, miễn trực, hoàn thành và dấu xóa. Gửi lại một báo cáo đang chờ giữ nguyên dấu thời gian và không tạo thêm báo cáo hay nhật ký. Nộp lại sau khi bị từ chối nhận dấu thời gian máy chủ mới.
3. `renderCleaning` đặt ID và dấu thời gian của lần nộp lên nút **Xác nhận** và **Làm lại**. Handler chuyển phiên bản từ nút đã bấm sang `reviewTask`, kể cả khi dữ liệu realtime đến giữa lúc bấm và lúc render lại. Duyệt ghi báo cáo, `assignment.completed` và nhật ký trong cùng giao dịch. Từ chối ghi báo cáo và nhật ký. Nút **Đánh dấu xong** của trưởng phòng tiếp tục dùng `completeTask`, ghi riêng nhánh lịch của tuần và kiểm tra lại phiên, phân công và dấu xóa.
4. Báo cáo và lịch đi về qua listener Firestore. Listener báo cáo hiện bỏ snapshot cache và pending writes. `acceptRoomShape` chặn revision cũ. `renderCleaning` và dashboard gọi `submissionMatchesAssignment` để đối chiếu đủ tuần, lịch, việc và người. Trạng thái hoàn thành, lịch sử, EXP và streak lấy từ `payload.schedules[weekStart].assignments[].completed` của `rooms/P708`. Báo cáo lưu các bước `in_progress → submitted → approved/rejected`. Dữ liệu cục bộ giữ bản hiển thị. Thành viên dùng báo cáo để bắt đầu, gửi checklist và gửi lại. Quyền đánh dấu trực tiếp của trưởng phòng tiếp tục áp dụng.
5. `saveManual`, luồng sửa dữ liệu và xóa lịch gọi `reconcileTaskSubmissions` theo tuần và ID lịch. Mỗi lần dọn đọc lại cả báo cáo và lịch hiện hành trong một giao dịch. Khi đã xóa lịch, gửi lại từ thiết bị cũ bị từ chối. Dấu xóa vẫn được giữ.

## Phạm vi điều tra

| Nhóm | Bằng chứng |
| --- | --- |
| A · Sự kiện | Browser QA bấm các nút bắt đầu, gửi checklist, duyệt, từ chối, đổi việc và đánh dấu trực tiếp. Bài kiểm tra phát cập nhật lúc `pointerdown` để kiểm tra render xen giữa. |
| B · Định danh | Hai lỗi trên được tái hiện ở cùng cặp nhiệm vụ/thành viên. Stress test đối chiếu tuần, scheduleId, taskId, memberId và actorUid của từng báo cáo. Thử gửi hộ bằng tài khoản khác bị từ chối. |
| C · Firestore | Browser QA dùng Auth/Firestore thật trong Emulator và đọc độc lập từ máy chủ. Bộ Rules kiểm tra các trường hợp hợp lệ và từ chối. Hai quản trị viên duyệt gần đồng thời ở stress test. |
| D · Đồng bộ và sửa dữ liệu | Tái hiện xóa nhầm báo cáo bằng danh sách cũ. Stress test thử lại sau ngoại tuyến, đọc trạng thái sau đăng nhập và reload, rồi kiểm tra lịch đã xóa và báo cáo không xuất hiện lại. |
| E · Phiên bản PWA | Bản phát hành `20261127-8` nhất quán giữa HTML, boot, loader, các module trực nhật được sửa và service worker. Boot QA và luồng Chrome mô phỏng kiểm tra bản chờ cập nhật, bảo toàn bản nháp, fallback ngoại tuyến và tải lại sau khi có mạng. |

## Kiểm thử

- 18 script QA tĩnh và bộ Firestore Rules đạt, gồm cache recovery, xóa lịch, streak, quyền sở hữu pet, repair và điện nước.
- Chrome và Edge cài trên Windows, Chromium 1280 px và WebKit 390 px qua Browser QA cho luồng trực nhật và điện nước. WebKit mô phỏng vùng hiển thị và đầu vào cảm ứng. Lượt WebKit trên Windows ghi cảnh báo kết nối Emulator và đạt các assertion.
- Mobile boot trên WebKit và mobile auth trên Chromium/WebKit đạt. Chromium Visual QA đạt ở 7 độ rộng từ 320 đến 1440 px với cả chế độ sáng và tối.
- Stress test Chromium trên Emulator đạt **106 thao tác thành công** gồm 42 lượt gửi, 6 từ chối, 36 xác nhận và 22 lượt retry. Hai quản trị viên và ba thành viên thao tác trên sáu tuần. Hai phiên thử gửi lại 20 lần cho cùng một báo cáo. Kiểm tra 36 phân công, 36 báo cáo đúng định danh, trạng thái tuần hiện tại, EXP, streak sau khi tải lại và lỗi Promise của trình duyệt. Một tuần thử riêng dùng để kiểm tra dấu xóa và từ chối gửi lại.
- CI Linux cho commit `72b682b` đạt toàn bộ QA, gồm mobile auth, Browser QA và Visual QA trên Chromium, Firefox và WebKit, Firestore Rules và stress test. Firefox Playwright trên máy Windows dừng ở bước mở trang với lỗi `Target crashed`. Lượt Firefox trên CI Linux đạt. [Kết quả GitHub Actions](https://github.com/phatnbt/truc_nhat/actions/runs/45873220909)

Chạy lại từ thư mục repository với các gói QA và trình duyệt của workflow đã cài.

```powershell
npx firebase-tools emulators:exec --only auth,firestore,hosting --project demo-p708-production-audit "node .github/browser-qa.mjs --critical-stress"
```

Đặt biến môi trường `P708_QA_CHROMIUM_CHANNEL` thành `chrome` hoặc `msedge` và truyền thêm đối số `chromium` để dùng trình duyệt desktop đã cài.

## Hạn chế và audit production

- **BLOCKED · Audit production.** Chưa có quyền đọc được cấp cho lượt kiểm tra này. `.github/production-data-audit.mjs` hiện đọc định danh, ngày ở, điện nước và 20 nhật ký gần nhất. Hai script repair và xóa lịch có ghi dữ liệu. Không chạy chúng. Kết quả Emulator chỉ phản ánh fixture.
- Khi có quyền read-only, đối chiếu lịch, báo cáo, ánh xạ UID, dấu xóa và nhật ký để thống kê báo cáo thiếu/trùng, báo cáo đã duyệt lệch phân công, ID sai, lịch xuất hiện sau xóa và EXP sai. Kiểm tra nhật ký đánh dấu trực tiếp trước khi kết luận một phân công hoàn thành thiếu báo cáo là bất thường. Chỉ đề xuất sửa từng bản ghi có đủ bằng chứng và cần backup, dry-run, rollback cùng phê duyệt.
- **NOT TESTED** trên thiết bị iPhone/Android thật, Safari macOS thật và PWA đã cài từ màn hình chính trên điện thoại. Chưa mô phỏng riêng các ca độ trễ cao, timeout lúc đang ghi, load lại giữa lúc write pending, commit xong nhưng mất phản hồi, hoặc thay người phụ trách đúng lúc gửi báo cáo. Chưa đo độ trễ production.
- Danh sách quản trị hiện vẫn lấy 200 báo cáo gần nhất. Báo cáo lịch sử thiếu scheduleId được giữ khi vẫn có phân công trùng tuần/việc/người, nhưng cần đối chiếu nguồn trước khi dùng để duyệt. Báo cáo của một lịch cũ giữ cùng khóa sẽ cần dọn theo dữ liệu máy chủ trước khi thành viên gửi cho lịch mới.

## Tệp thay đổi và rollback

- `src/core/p708-secure-sync-engine.js`, `src/core/app-core1.js`, `src/features/app-actions1.js`, `src/features/app-integrity-fixes.js`, `src/features/app-render.js`, `src/features/app-dashboard.js`, `src/boot/app-start.js` cập nhật giao dịch, kết nối sự kiện và hiển thị.
- `app.js`, `index.html`, `sw.js`, `src/boot/app-loader.js`, `.github/boot-recovery.test.mjs` đồng bộ phiên bản.
- `.github/browser-qa.mjs`, `.github/critical-cleaning-stress.mjs`, `.github/workflows/qa.yml` chạy regression và stress test trên CI.
- Schema và Firestore Rules giữ nguyên. Khi cần rollback sau phát hành, dùng commit đảo trên nhánh phát hành, tăng phiên bản cache/boot mới và chạy lại QA trước khi triển khai. Giữ nguyên lịch, báo cáo, nhật ký và dấu xóa trên máy chủ. Khôi phục bản ghi chỉ theo quy trình repair độc lập có backup và phê duyệt.
- Firebase Hosting và GitHub Pages deploy bằng workflow thủ công giới hạn ở `main`. Các workflow repair production được kiểm tra riêng, chỉ chạm khi dispatch hoặc thỏa bộ lọc nhánh/đường dẫn của chúng. Nhánh sửa lỗi chỉ kích hoạt QA.
