import { createP708SecureEngine } from "../core/p708-secure-sync-engine.js?v=20260827-4";

globalThis.createP708SecureEngine = createP708SecureEngine;

const parts = [
  "../core/app-core1.js?v=20260827-4",
  "../core/app-core2.js?v=20260827-4",
  "../features/app-actions1.js?v=20260827-4",
  "../features/app-actions2.js?v=20260827-4",
  "../features/app-dashboard.js?v=20260827-4",
  "../features/app-render.js?v=20260827-4",
  "../features/app-integrity-fixes.js?v=20260827-4",
  "../features/home-enhancements.js?v=20260827-4",
  "./app-start.js?v=20260827-4",
  "../features/notification-enhancements.js?v=20260827-4",
  "../features/today-calendar.js?v=20260827-4",
  "../features/mobile-install-bridge.js?v=20260827-4",
  "../features/mobile-install-guide.js?v=20260827-4"
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(src, import.meta.url).href;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Không thể tải ${src}`));
    document.head.appendChild(script);
  });
}
