import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

let bridgeInstance: any = null;

export async function initBridge(): Promise<any> {
  bridgeInstance = await waitForEvenAppBridge();
  return bridgeInstance;
}

export function getBridge(): any {
  if (!bridgeInstance) throw new Error('Bridge not initialized');
  return bridgeInstance;
}
