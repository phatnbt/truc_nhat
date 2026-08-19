import { createP708SecureEngine } from "./p708-secure-sync-engine.js?v=20260819-6";

globalThis.createP708SecureEngine = createP708SecureEngine;

const parts = [
  "./app-core1.js?v=20260819-6",
  "./app-core2.js?v=20260819-6",
  "./app-actions1.js?v=20260819-6",
  "./app-actions2.js?v=20260819-6",
  "./app-dashboard.js?v=20260819-6",
  "./app-render.js?v=20260819-6",
  "./home-enhancements.js?v=20260819-6",
  "./app-start.js?v=20260819-6",
  "./notification-enhancements.js?v=20260819-8",
  "./today-calendar.js?v=20260819-10"
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
