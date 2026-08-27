import { createP708SecureEngine } from "./p708-secure-sync-engine.js?v=20260827-1";

globalThis.createP708SecureEngine = createP708SecureEngine;

const parts = [
  "./app-core1.js?v=20260827-1",
  "./app-core2.js?v=20260827-1",
  "./app-actions1.js?v=20260827-1",
  "./app-actions2.js?v=20260827-1",
  "./app-dashboard.js?v=20260827-1",
  "./app-render.js?v=20260827-1",
  "./app-integrity-fixes.js?v=20260827-1",
  "./home-enhancements.js?v=20260827-1",
  "./app-start.js?v=20260827-1",
  "./notification-enhancements.js?v=20260827-1",
  "./today-calendar.js?v=20260827-1",
  "./mobile-install-bridge.js?v=20260827-1",
  "./mobile-install-guide.js?v=20260827-1"
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Không thể tải ${src}`));
    document.head.appendChild(script);
  });
}
