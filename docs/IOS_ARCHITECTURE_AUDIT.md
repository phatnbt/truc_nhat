# Auditing P708 on iOS

Baseline là commit `54d91aa`, bản production `20261127-11`. Tag `backup/p708-ios-before-bootstrap-20261127` trỏ đến commit này. Nhánh `fix/ios-webkit-bootstrap-recovery` xuất phát từ `main` để giới hạn thay đổi vào khởi động, tương thích và chẩn đoán.

## Tầng đã kiểm tra

| Tầng | Bằng chứng |
| --- | --- |
| 1 · DNS và HTTPS | Hai hostname Firebase phân giải cùng IPv4 trong lần đo. GitHub Pages cũng phân giải. TLS 1.2 xác minh chứng chỉ thành công trên Firebase và Pages, HTTP 200, 0 redirect với các đường dẫn `index.html` đã kiểm. Thiết bị thật có thể dùng resolver và mạng khác. |
| 2–4 · HTML, CSS và cú pháp | Đối chiếu bytes và MIME với Git. Mở iPhone preset WebKit và kiểm HTML/CSS tĩnh độc lập. Mô phỏng thiếu `Array.at` và `Object.hasOwn` làm lộ một lỗi runtime trước Auth. |
| 5–8 · Dependency, boot, lưu trữ, SDK | Kiểm tra cài script theo thứ tự, lỗi tải script cốt lõi và phụ, timeout, bộ nhớ Firestore và persistence SDK Auth. Thử chặn SDK và thử LocalStorage bị từ chối. |
| 9–12 · Auth, quyền, sync, giao diện | Giữ cùng chính sách origin và Firebase Rules. Existing QA kiểm quyền, khôi phục phiên, dấu lịch trực, ngày ở và điện nước trong Emulator. Diagnostics chỉ kiểm Auth tạm bằng bộ nhớ và phản hồi Firestore ở một đường dẫn luôn bị từ chối theo Rules. |
| 13–14 · PWA và vòng đời | So boot WebKit khi chặn worker, với worker passthrough và với worker của bản phát hành. Offline, reconnect và pageshow/resume có bài Emulator. Home Screen và vòng đời iOS thật cần xác nhận tại thiết bị. |

## Kiểm tra hosting trực tiếp

- Hai hostname Firebase khớp cả **50/50** tài nguyên HTML, CSS, JS và manifest ở commit baseline. HTML Firebase có Brotli, `no-cache, no-store, must-revalidate` và CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`. Không phát hiện tài nguyên JS hoạt động nào trả HTML.
- GitHub Pages khớp **49/50**. Tệp gốc `app-integrity-fixes.js` trả 404 vì workflow chỉ đóng gói entry files và `src`. Loader chỉ gọi `src/features/app-integrity-fixes.js`, và tệp được dùng có đúng bytes. HTML Pages dùng gzip và `max-age=600`.
- Hai endpoint config đã trả HTTP 200, project `p708-room-manager` và authDomain `p708-room-manager.firebaseapp.com`. Endpoint runtime dùng cho Pages trả CORS đúng origin Pages. Không xuất nội dung config chứa API key.
- Manifest vẫn `id="./"`, `scope="./"`, `start_url="./index.html"`. Lịch/điện nước dùng hash. Dấu trang hay biểu tượng trên chiếc iPhone báo lỗi chưa được quan sát. Không thay origin hay manifest identity.

## Mã và lịch sử

`4aee16e` sửa cache bị lẫn tài nguyên. `f681b75` song song hóa script. `1081b50` tách Auth restoration khỏi quyền và dữ liệu phòng. `8094f35` thêm matching phiên bản, xử lý resume và cập nhật an toàn. `7ea6c26` đưa pet vào loader chung. `492009d` ghi nhận đường dẫn chart dùng `Array.at` khi tổ chức lại repo. Bisection lỗi trên chiếc iPhone báo lỗi chưa khả thi vì chưa có bản máy thật chạy được và bước tái hiện trên máy đó.

Graphify và kiểm tra trực tiếp xác định các wrapper cũ quanh `renderHome`, `renderCleaning`, `renderAll`. Các hàm sửa lịch/xóa lịch/chu kỳ hóa đơn vẫn có wrapper nghiệp vụ phải được thực thi theo thứ tự. Trình tải không gọi lặp SDK module cùng URL. Không phát hiện chu trình import ES trong đồ thị bootstrap phía app. Legacy scripts dùng global state, vì vậy danh sách bắt buộc tải theo thứ tự cố định. Các workflow repair production có bộ lọc riêng và không được chạy bởi nhánh kiểm tra.

[Sơ đồ bootstrap](BOOTSTRAP_ARCHITECTURE.md) · [Báo cáo nguyên nhân](IOS_ROOT_CAUSE_REPORT.md)
