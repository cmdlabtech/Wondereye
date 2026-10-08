import { describe, expect, it } from 'vitest';
import { isFatalVerifyCode, isVerifyMessage, verifyFrameUrl, VERIFY_ORIGIN } from '../src/feedback';

describe('verify frame helpers', () => {
  it('builds the wondereye.app frame URL with the parent origin and language', () => {
    const u = new URL(verifyFrameUrl('http://127.0.0.1:43123', 'zh'));
    expect(u.origin).toBe('https://wondereye.app');
    expect(u.pathname).toBe('/verify-frame');
    expect(u.searchParams.get('parent')).toBe('http://127.0.0.1:43123');
    expect(u.searchParams.get('lang')).toBe('zh-cn');
  });

  it('accepts only messages from the frame window on wondereye.app', () => {
    const frame = {} as Window;
    const other = {} as Window;
    const data = { source: 'wondereye-verify', event: 'token', token: 'abc' };
    expect(isVerifyMessage({ origin: VERIFY_ORIGIN, source: frame, data }, frame)).toBe(true);
    expect(isVerifyMessage({ origin: 'https://evil.example', source: frame, data }, frame)).toBe(false);
    expect(isVerifyMessage({ origin: VERIFY_ORIGIN, source: other, data }, frame)).toBe(false);
    expect(isVerifyMessage({ origin: VERIFY_ORIGIN, source: frame, data: { event: 'token' } }, frame)).toBe(false);
    expect(isVerifyMessage({ origin: VERIFY_ORIGIN, source: frame, data }, null)).toBe(false);
  });

  it('treats config and load errors as fatal, challenge failures as retryable', () => {
    for (const c of ['load', 'timeout', '110200', '110100', '200500', '400020']) expect(isFatalVerifyCode(c)).toBe(true);
    for (const c of ['600010', '300030', '110600', undefined]) expect(isFatalVerifyCode(c)).toBe(false);
  });
});
