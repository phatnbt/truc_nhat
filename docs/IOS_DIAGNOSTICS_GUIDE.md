# Gửi báo cáo từ iPhone

1. Trên Safari, mở **Kiểm tra thiết bị** từ màn hình lỗi P708 hoặc vào `/ios-diagnostics.html` trên cùng máy chủ đang thử. Nếu kiểm bản preview, dùng link preview trong báo cáo kiểm thử.
2. Chờ các dòng Firebase và Firestore hoàn tất. Bấm **Sao chép báo cáo**. Nếu Safari chặn clipboard, chọn phần văn bản được hiện và sao chép thủ công.
3. Gửi báo cáo kèm phiên bản iOS, model iPhone, thời điểm, mạng đã dùng và cách mở app. Ghi riêng Safari trực tiếp, dấu trang, link chia sẻ hoặc biểu tượng màn hình chính. Có thể chỉ gửi hostname và đường dẫn thường, bỏ query OAuth.
4. Nếu trang chính hiện **Chưa thể mở P708**, gửi thêm báo cáo từ nút **Sao chép báo cáo** ngay trên màn hình khôi phục.

PASS biểu thị phép thử đã chạy thành công. FAIL đi kèm mã và thời điểm. NOT SUPPORTED là khả năng không có. NOT TESTED thường do bước phụ thuộc đã dừng hoặc preview đã chủ động khóa Firestore. PASS `permission-denied` ở Firestore nghĩa là kết nối đến máy chủ hoạt động và Rules từ chối chính xác probe. Báo cáo không xuất email, token, khóa API, query OAuth hay dữ liệu phòng.

Nếu có macOS và iPhone, bật **Web Inspector** trong Settings của Safari trên iPhone, kết nối với Mac rồi chọn đúng trang Safari hoặc Home Screen web app trong menu Develop. Ghi request lỗi đầu tiên, phase và build, trước khi thu các lỗi dây chuyền. [WebKit Web Inspector](https://webkit.org/web-inspector/enabling-web-inspector/)
