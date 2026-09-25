import { describe, expect, it } from '@jest/globals';
import { validateIdentifier, validatePassword } from '@/lib/account';
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

describe('account validation', () => {
  it('checks emails and phone numbers', () => {
    expect(validateIdentifier('email', 'me@example.com')).toBeNull();
    expect(validateIdentifier('email', 'me@example')).not.toBeNull();
    expect(validateIdentifier('phone', '(555) 123-4567')).toBeNull();
    expect(validateIdentifier('phone', '555-1234')).not.toBeNull();
  });

  it('requires 8+ characters mixing letters and numbers', () => {
    expect(validatePassword('short1')).not.toBeNull();
    expect(validatePassword('lettersonly')).not.toBeNull();
    expect(validatePassword('habits2026')).toBeNull();
  });
});
