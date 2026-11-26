export const P708_AUTH_HOME="https://p708-room-manager.firebaseapp.com/";

export function authEnvironment({userAgent="",platform="",maxTouchPoints=0,standalone=false}={}){
  const embedded=/Zalo|FBAN|FBAV|FB_IAB|Messenger|Instagram|;\s*wv\b|\bWebView\b/i.test(userAgent);
  const mobile=/Android|iPhone|iPad|iPod/i.test(userAgent)||(platform==="MacIntel"&&maxTouchPoints>1);
  return {embedded,mobile,standalone};
}

export function authDestination(hash=""){
  return new URL(hash.startsWith("#")?hash:"/",P708_AUTH_HOME).href;
}

const messages={
  "auth/popup-blocked":"Trình duyệt đã chặn cửa sổ đăng nhập. Hãy mở P708 trong Safari hoặc Chrome rồi thử lại.",
  "auth/popup-closed-by-user":"Bạn đã đóng cửa sổ Google. Có thể thử lại.",
  "auth/cancelled-popup-request":"Đăng nhập đã bị hủy. Có thể thử lại.",
  "auth/unauthorized-domain":"Tên miền này chưa được cấp quyền đăng nhập. Hãy mở link Firebase của P708 hoặc báo trưởng phòng.",
  "auth/network-request-failed":"Mất kết nối khi đăng nhập. Hãy kiểm tra mạng rồi thử lại.",
  "auth/operation-not-supported-in-this-environment":"Hãy mở link P708 trực tiếp trong Chrome hoặc Safari để đăng nhập Google.",
  "auth/web-storage-unsupported":"Trình duyệt đang hạn chế lưu phiên. Hãy mở link trong Safari hoặc Chrome thông thường và thử lại.",
  "auth/operation-not-allowed":"Đăng nhập Google chưa sẵn sàng. Hãy báo trưởng phòng kiểm tra cấu hình Firebase.",
  "auth/invalid-credential":"Không xác nhận được phiên Google. Hãy đăng nhập lại trong trình duyệt.",
  "auth/user-disabled":"Tài khoản Google này đã bị vô hiệu hóa trong hệ thống xác thực.",
  "auth/account-exists-with-different-credential":"Tài khoản này dùng phương thức đăng nhập khác. Hãy báo trưởng phòng.",
  "auth/too-many-requests":"Có quá nhiều lần thử. Hãy chờ một lúc rồi thử lại.",
  "auth/user-token-expired":"Phiên đăng nhập đã hết hiệu lực. Hãy đăng nhập lại.",
  "auth/invalid-user-token":"Phiên đăng nhập đã hết hiệu lực. Hãy đăng nhập lại."
};

export function authErrorMessage(code){
  return messages[code]||"Không thể hoàn tất đăng nhập Google. Hãy thử lại hoặc mở link P708 trong Safari hoặc Chrome.";
}
