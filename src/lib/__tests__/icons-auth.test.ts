import { describe, expect, it } from '@jest/globals';
import { authMessage, validateCode, validateEmail, validatePassword } from '@/lib/auth';
import { BUILD_GROUPS, categoryOf, iconText, QUIT_GROUPS, VAPE_ICON } from '@/lib/icons';

describe('icons', () => {
  it('has no duplicate icons within a kind', () => {
    const build = BUILD_GROUPS.flatMap((g) => g.icons);
    const quit = QUIT_GROUPS.flatMap((g) => g.icons.map((i) => i.icon));
    expect(new Set(build).size).toBe(build.length);
    expect(new Set(quit).size).toBe(quit.length);
  });

  it('files habits into categories and falls back to Other', () => {
    expect(categoryOf('build', '💧').label).toBe('Health');
    expect(categoryOf('quit', VAPE_ICON).label).toBe('Substances');
    expect(categoryOf('build', '🦄').key).toBe('other');
  });

  it('gives custom icons a text fallback for notifications', () => {
    expect(iconText(VAPE_ICON)).toBe('💨');
    expect(iconText('📚')).toBe('📚');
  });
});

describe('auth forms', () => {
  it('checks emails and codes', () => {
    expect(validateEmail(' me@example.com ')).toBeNull();
    expect(validateEmail('me@example')).not.toBeNull();
    expect(validateCode('123456')).toBeNull();
    expect(validateCode('12ab56')).not.toBeNull();
  });

  it('explains Supabase errors in plain words', () => {
    expect(authMessage({ code: 'invalid_credentials' })).toMatch(/don’t match/);
    expect(authMessage({ name: 'AuthRetryableFetchError', status: 0 })).toMatch(/offline/);
    expect(authMessage({ code: 'email_not_confirmed' })).toMatch(/Forgot password/);
  });

  it('requires 8+ characters mixing letters and numbers', () => {
    expect(validatePassword('short1')).not.toBeNull();
    expect(validatePassword('lettersonly')).not.toBeNull();
    expect(validatePassword('habits2026')).toBeNull();
  });
});
