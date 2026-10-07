// Applies translations to static markup in app.html:
//   data-i18n="key"              -> textContent
//   data-i18n-placeholder="key"  -> placeholder
//   data-i18n-aria="key"         -> aria-label
import { t, type StringKey } from './i18n';

export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as StringKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder as StringKey));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as StringKey));
  });
}
