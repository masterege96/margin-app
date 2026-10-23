import { describe, expect, it } from 'vitest';
import { microToExact, microToInput, parseUsdToMicro, safeCsvCell, timeCostMicro } from '../src/format.js';

describe('parseUsdToMicro', () => {
  it.each([
    ['0', 0],
    ['12', 12_000_000],
    ['12.5', 12_500_000],
    [' 99.99 ', 99_990_000],
    ['0.0035', 3_500],
    ['0.000001', 1],
    ['0.0000005', 1], // rounds half up at the 7th decimal
    ['0.0000004', 0],
    ['1200.', 1_200_000_000],
    ['0.1', 100_000], // no float drift: 0.1 is exactly 100000 micro
  ])('%s → %i', (input, expected) => {
    expect(parseUsdToMicro(input)).toBe(expected);
  });

  it.each(['', '-1', 'abc', '1,000', '1e3', '12.3.4', null, undefined])('rejects %s', (input) => {
    expect(parseUsdToMicro(input)).toBeNull();
  });
});

describe('microToInput / microToExact', () => {
  it('round-trips through the form field', () => {
    for (const m of [0, 1, 3_500, 12_500_000, 1_200_000_000, 123_456_789]) {
      expect(parseUsdToMicro(microToInput(m))).toBe(m);
    }
  });
  it('prints six decimals for exports', () => {
    expect(microToExact(28_200_000)).toBe('28.200000');
    expect(microToExact(-28_200_000)).toBe('-28.200000');
    expect(microToExact(1)).toBe('0.000001');
  });
});

describe('timeCostMicro', () => {
  it('is minutes / 60 × rate', () => {
    expect(timeCostMicro(90, 35_000_000)).toBe(52_500_000);
    expect(timeCostMicro(1, 40_000_000)).toBe(666_667);
    expect(timeCostMicro(0, 40_000_000)).toBe(0);
  });
});

describe('safeCsvCell', () => {
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(safeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(safeCsvCell('-28.200000')).toBe('"-28.200000"');
    expect(safeCsvCell('@cmd')).toBe(`"'@cmd"`);
  });
});
