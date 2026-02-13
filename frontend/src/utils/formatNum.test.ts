import { describe, it, expect } from 'vitest';
import { formatNum4, formatNum4Signed } from './formatNum';

describe('formatNum', () => {
  it('formatNum4 formats with 4 decimals', () => {
    expect(formatNum4(0)).toBe('0,0000');
    expect(formatNum4(1.5)).toBe('1,5000');
    expect(formatNum4(-2.1234)).toMatch(/^-?2,1234$/);
  });

  it('formatNum4Signed adds + or -', () => {
    expect(formatNum4Signed(1)).toMatch(/^\+/);
    expect(formatNum4Signed(-1)).toMatch(/^-/);
    expect(formatNum4Signed(0)).toMatch(/^\+0,0000$/);
  });
});
