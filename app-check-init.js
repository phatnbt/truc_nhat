import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import { APP_CHECK_SITE_KEY } from "./app-check-config.js?v=20260819-4";

const FIREBASE_CONFIG = {
  apiKey:"AIzaSyAY42QGO8uYHJ9OZgfFw1kNKfnOv9hiHgc",
  authDomain:"p708-room-manager.firebaseapp.com",
  projectId:"p708-room-manager",
  storageBucket:"p708-room-manager.firebasestorage.app",
  messagingSenderId:"1073859440549",
  appId:"1:1073859440549:web:21879794f23e4d2ecc824c",
  measurementId:"G-PEW1YC01GY"
};

const APP_NAME = "p708-secure-manager-v5";
const app = getApps().some(item=>item.name===APP_NAME) ? getApp(APP_NAME) : initializeApp(FIREBASE_CONFIG, APP_NAME);

if (APP_CHECK_SITE_KEY) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
    globalThis.P708_APP_CHECK = { enabled:true, provider:"recaptcha-v3" };
  } catch (error) {
    console.error("P708 App Check initialization failed", error);
    globalThis.P708_APP_CHECK = { enabled:false, error };
  }
} else {
  console.info("P708 App Check is prepared but not active yet: add the reCAPTCHA v3 site key in app-check-config.js before enabling enforcement.");
  globalThis.P708_APP_CHECK = { enabled:false, reason:"missing-site-key" };
}

export { app };
