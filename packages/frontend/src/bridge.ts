import { EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

let bridgeInstance: EvenAppBridge | null = null;

export async function initBridge(): Promise<EvenAppBridge> {
  try {
    bridgeInstance = await Promise.race([
      waitForEvenAppBridge(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Bridge timeout')), 5000)
      ),
    ]);
  } catch {
    // Some hosts never fire the bridge-ready event but the singleton still works
    console.warn('[bridge] waitForEvenAppBridge timed out, trying getInstance');
    try {
      bridgeInstance = EvenAppBridge.getInstance();
    } catch {
      bridgeInstance = null;
    }
  }
  if (!bridgeInstance) {
    throw new Error('Glasses not connected. Open the Even app and connect your G2.');
  }
  return bridgeInstance;
}

export function getBridge(): EvenAppBridge {
  if (!bridgeInstance) throw new Error('Bridge not initialized');
  return bridgeInstance;
}
