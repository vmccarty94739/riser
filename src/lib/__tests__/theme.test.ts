import { describe, expect, it } from '@jest/globals';

import { Colors, readableText, THEME_SWATCHES } from '@/constants/theme';

describe('readable text on colored backgrounds', () => {
  it('keeps white on the brand blue and flips to dark on bright colors', () => {
    expect(readableText(Colors.light.accent)).toBe('#FFFFFF');
    expect(readableText(Colors.dark.success)).toBe('#111418');
    expect(readableText(Colors.dark.gold)).toBe('#111418');
  });

  it('picks a readable text color for every unlockable swatch in both modes', () => {
    for (const swatch of THEME_SWATCHES) {
      for (const bg of [swatch.light, swatch.dark]) {
        expect(['#FFFFFF', '#111418']).toContain(readableText(bg));
      }
    }
  });
});
