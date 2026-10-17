// Anonymous explorer label for first discoveries on the public map.
// A random ID is created on this device on first run and kept in local
// storage. Only the derived "Explorer #NNNN" label is ever sent; no account,
// name, or device identifier is read or transmitted.

const KEY = 'wondereye.explorerId';

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Derive a 4-digit display number (0000–9999) from a hex ID. */
export function explorerNumber(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return String(h % 10000).padStart(4, '0');
}

export function explorerLabelFor(id: string): string {
  return `Explorer #${explorerNumber(id)}`;
}

/** Returns this device's label, creating the random ID on first run. */
export function getExplorerLabel(): string | undefined {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[0-9a-f]{32}$/.test(id)) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return explorerLabelFor(id);
  } catch {
    return undefined;
  }
}
