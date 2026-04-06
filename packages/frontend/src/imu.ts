import { EvenAppBridge, ImuReportPace, OsEventTypeList } from '@evenrealities/even_hub_sdk';

export interface IMUCallbacks {
  onHeadingUpdate: (x: number, y: number) => void;
}

// Returns an event handler to be routed through the single onEvenHubEvent listener.
export function initIMU(bridge: EvenAppBridge, callbacks: IMUCallbacks): (event: any) => void {
  bridge.imuControl(true, ImuReportPace.P200).catch((err: unknown) => {
    console.warn('[imu] imuControl enable failed:', err);
  });
  return function handleIMUEvent(event: any): void {
    if (event.sysEvent?.eventType !== OsEventTypeList.IMU_DATA_REPORT) return;
    const x: number | undefined = event.sysEvent?.imuData?.x;
    const y: number | undefined = event.sysEvent?.imuData?.y;
    if (x != null && y != null) {
      callbacks.onHeadingUpdate(x, y);
    }
  };
}
