import { EvenAppBridge, ImuReportPace, OsEventTypeList } from '@evenrealities/even_hub_sdk';

export interface IMUCallbacks {
  onHeadingUpdate: (x: number, y: number) => void;
}

// Toggle IMU reporting. Fire-and-forget with .catch — imuControl rejections
// crash the EvenHub WebView on some firmware if unhandled.
export function setIMUReporting(bridge: EvenAppBridge, on: boolean): void {
  bridge.imuControl(on, ImuReportPace.P200).catch((err: unknown) => {
    console.warn(`[imu] imuControl ${on ? 'enable' : 'disable'} failed:`, err);
  });
}

// Returns an event handler to be routed through the single onEvenHubEvent listener.
export function initIMU(bridge: EvenAppBridge, callbacks: IMUCallbacks): (event: any) => void {
  setIMUReporting(bridge, true);
  return function handleIMUEvent(event: any): void {
    if (event.sysEvent?.eventType !== OsEventTypeList.IMU_DATA_REPORT) return;
    const x: number | undefined = event.sysEvent?.imuData?.x;
    const y: number | undefined = event.sysEvent?.imuData?.y;
    if (x != null && y != null) {
      callbacks.onHeadingUpdate(x, y);
    }
  };
}
