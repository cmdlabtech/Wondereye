import { EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

let bridgeInstance: EvenAppBridge | null = null;

export async function initBridge(): Promise<EvenAppBridge> {
  // Try waitForEvenAppBridge with a 5s timeout
  bridgeInstance = await Promise.race([
    waitForEvenAppBridge(),
    new Promise<EvenAppBridge>((_, reject) =>
      setTimeout(() => reject(new Error('Bridge timeout')), 5000)
    ),
  ]).catch(() => {
    // Fallback: grab the singleton directly
    console.warn('[bridge] waitForEvenAppBridge timed out, trying getInstance');
    return EvenAppBridge.getInstance();
  });

  console.log('[bridge] initialized:', !!bridgeInstance);
  return bridgeInstance;
}

export function getBridge(): EvenAppBridge {
  if (!bridgeInstance) throw new Error('Bridge not initialized');
  return bridgeInstance;
}
