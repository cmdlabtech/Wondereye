import { getLang } from './i18n';

export type UnitSystem = 'imperial' | 'metric';

const KEY = 'wondereye-units';

export function getUnits(): UnitSystem {
  // Until the user picks, English keeps the historical imperial default;
  // every other supported language defaults to metric.
  return (localStorage.getItem(KEY) as UnitSystem) || (getLang() === 'en' ? 'imperial' : 'metric');
}

export function setUnits(units: UnitSystem): void {
  localStorage.setItem(KEY, units);
}
