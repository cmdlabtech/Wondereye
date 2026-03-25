---
name: IMU imuControl must be error-guarded
description: imuControl() unhandled promise rejection crashes the EvenHub app on glasses — always .catch() it
type: feedback
---

Always `.catch()` unhandled promise rejections on `bridge.imuControl()` calls. An unhandled rejection crashes the EvenHub WebView on the glasses, causing the app to fail silently at load time (similar to how `getLocation` crashes the glasses — certain bridge API calls must be assumed potentially fatal on unsupported firmware).

**Why:** In v1.2.0, `imuControl(true)` was called without `.catch()` in both `imu.ts` and the lifecycle handlers in `events.ts`. This caused the app to not load on glasses hardware, even though it rendered fine in a browser WebView. The fix was adding `.catch()` everywhere `imuControl` is called and wrapping `initIMU()` in a try/catch in `main.ts`.

**How to apply:** Any new bridge API that is not confirmed to work on real hardware should be wrapped in try/catch or `.catch()`. Assume any unhandled rejection in the EvenHub WebView may crash the app.
