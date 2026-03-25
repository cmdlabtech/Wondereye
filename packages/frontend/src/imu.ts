import { EvenAppBridge } from '@evenrealities/even_hub_sdk';

const IMU_DATA_REPORT = 8;  // OsEventTypeList.IMU_DATA_REPORT (added in SDK 0.0.9)
const IMU_PACE_200 = 200;   // ImuReportPace.P200 (added in SDK 0.0.9)
const NOD_THRESHOLD = 0.4;
const NOD_COOLDOWN_MS = 600;

// Returns an event handler to be routed through the single onEvenHubEvent listener.
// Calling imuControl via (bridge as any) so it degrades safely on SDK 0.0.7 hardware
// where the method doesn't exist.
export function initIMU(bridge: EvenAppBridge, onNod: () => void): (event: any) => void {
  (bridge as any).imuControl?.(true, IMU_PACE_200)?.catch?.((err: unknown) => {
    console.warn('[imu] imuControl enable failed:', err);
  });
  let lastZ: number | null = null;
  let lastNodTime = 0;
  return function handleIMUEvent(event: any): void {
    if (event.sysEvent?.eventType !== IMU_DATA_REPORT) return;
    const z: number | undefined = event.sysEvent?.imuData?.z;
    if (z == null) return;
    if (lastZ !== null) {
      const delta = z - lastZ;
      const now = Date.now();
      if (delta > NOD_THRESHOLD && now - lastNodTime > NOD_COOLDOWN_MS) {
        lastNodTime = now;
        onNod();
      }
    }
    lastZ = z;
  };
}
