import { describe, expect, it } from 'vitest';
import type { PropertiesFilter } from '../hooks/useProperties';
import { parseListSearch, toListSearch } from './list-search';

const NO_FILTER: PropertiesFilter = { city: '', state: '', zipCode: '' };
const VALID = 'city=Fountain+Hills&state=AZ&zip=85268&sort=asc';

function parse(search: string) {
  return parseListSearch(new URLSearchParams(search));
}

describe('parseListSearch', () => {
  it('gives no filter and newest first for empty params', () => {
    expect(parse('')).toEqual({ filter: NO_FILTER, sort: 'CREATED_AT_DESC' });
  });

  it('reads every valid field', () => {
    expect(parse(VALID)).toEqual({
      filter: { city: 'Fountain Hills', state: 'AZ', zipCode: '85268' },
      sort: 'CREATED_AT_ASC',
    });
  });

  // One invalid field at a time, the others valid: only that field falls back.
  it.each([
    ['city of 100 characters is kept', 'city', 'a'.repeat(100), { city: 'a'.repeat(100) }],
    ['city of 101 characters is dropped', 'city', 'a'.repeat(101), { city: '' }],
    ['zip of 5 characters is kept', 'zip', '12345', { zipCode: '12345' }],
    ['zip of 6 characters is dropped', 'zip', '123456', { zipCode: '' }],
    ['lower-case state is upper-cased', 'state', 'az', { state: 'AZ' }],
    ['unknown state is dropped', 'state', 'XX', { state: '' }],
  ])('%s', (_name, key, value, expected) => {
    const params = new URLSearchParams(VALID);
    params.set(key, value);
    expect(parseListSearch(params)).toEqual({
      filter: { city: 'Fountain Hills', state: 'AZ', zipCode: '85268', ...expected },
      sort: 'CREATED_AT_ASC',
    });
  });

  it.each([
    ['asc', 'CREATED_AT_ASC'],
    ['desc', 'CREATED_AT_DESC'],
    ['foo', 'CREATED_AT_DESC'],
    ['ASC', 'CREATED_AT_DESC'],
  ])('sort=%s gives %s and keeps the filters', (value, expected) => {
    expect(parse(`city=Austin&state=TX&zip=78701&sort=${value}`)).toEqual({
      filter: { city: 'Austin', state: 'TX', zipCode: '78701' },
      sort: expected,
    });
  });

  it('takes the first value of a repeated key', () => {
    expect(parse('city=Austin&city=Dallas').filter.city).toBe('Austin');
  });
});

describe('toListSearch', () => {
  it('writes nothing for no filter and newest first', () => {
    expect(toListSearch({ filter: NO_FILTER, sort: 'CREATED_AT_DESC' }).toString()).toBe('');
  });

  it('writes every set field in a fixed order, with sort=asc for oldest first', () => {
    expect(
      toListSearch({
        filter: { zipCode: '85268', state: 'AZ', city: 'Fountain Hills' },
        sort: 'CREATED_AT_ASC',
      }).toString(),
    ).toBe(VALID);
  });

  it('leaves out blank and whitespace-only values and trims the rest', () => {
    expect(
      toListSearch({
        filter: { city: '  Austin ', state: '   ', zipCode: '' },
        sort: 'CREATED_AT_DESC',
      }).toString(),
    ).toBe('city=Austin');
    expect(
      toListSearch({
        filter: { city: ' ', state: 'TX', zipCode: ' 78701 ' },
        sort: 'CREATED_AT_DESC',
      }).toString(),
    ).toBe('state=TX&zip=78701');
  });

  it('round-trips through parseListSearch with the values trimmed', () => {
    const state = {
      filter: { city: ' Fountain Hills ', state: 'AZ', zipCode: '85268 ' },
      sort: 'CREATED_AT_ASC',
    } as const;
    expect(parseListSearch(toListSearch(state))).toEqual({
      filter: { city: 'Fountain Hills', state: 'AZ', zipCode: '85268' },
      sort: 'CREATED_AT_ASC',
    });
  });
});
