export type UnitSystem = 'imperial' | 'metric';

const KEY = 'wondereye-units';

export function getUnits(): UnitSystem {
  return (localStorage.getItem(KEY) as UnitSystem) || 'imperial';
}

export function setUnits(units: UnitSystem): void {
  localStorage.setItem(KEY, units);
}
