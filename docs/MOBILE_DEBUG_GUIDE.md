# P708 · Lấy báo cáo chẩn đoán trên điện thoại

Trong app đã mở, vào **Tài khoản & phân quyền → Mở chẩn đoán** để xem báo cáo trong cùng cửa sổ. Nếu app chưa mở được, mở đường dẫn P708 cùng hostname với ứng dụng đang lỗi và thêm `?debug=1`. Ví dụ `https://p708-room-manager.firebaseapp.com/index.html?debug=1`. Báo cáo hiển thị **standalone** hoặc **browser** để nhận biết link có mở ra trình duyệt riêng hay không.

1. Mở **Chẩn đoán P708** ở góc trên. Ghi lại thời điểm và thao tác gặp lỗi.
2. Bấm **Sao chép báo cáo**. Nếu trình duyệt hạn chế clipboard, dùng văn bản đã được chọn trong bảng.
3. Gửi báo cáo cho người bảo trì cùng loại thiết bị, phiên bản iOS/Android và thao tác ngay trước lỗi. Ví dụ **Mở từ biểu tượng, đăng nhập Google xong, quay về màn hình đăng nhập**.

Báo cáo có release của trang, loader, build commit nếu hosting cung cấp metadata, controller, cache, phiên, khả năng ghi/đọc dữ liệu thử, network, listener, nguồn snapshot, pending writes, thời điểm đồng bộ máy chủ và mã lỗi. `lastSync` là mili giây Unix. Mỗi mốc chỉ có trường và giá trị được phép. Query OAuth, UID, email, credential, thông tin phòng và lỗi thô được loại khỏi báo cáo. Dữ liệu chẩn đoán nằm trong bộ nhớ của trang và chỉ chia sẻ khi người dùng tự gửi.

Nếu app giữ bản cũ, chụp thông tin phiên bản trong **Tài khoản & phân quyền** và kiểm thông báo **Cập nhật**. Trạng thái cache cho biết namespace mà worker báo đang dùng. Trạng thái persistence cho biết Firebase đang quản lý fallback. SDK không công bố loại storage cuối cùng qua API public, vì vậy các trường probe cho biết khả năng của thiết bị.
