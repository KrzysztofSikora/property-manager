// Public landmarks, not private homes (B-N7): real, stable addresses in a public repo. Each city
// is far from a state border, so Weatherstack's region matches the state (R-03). Every entry
// costs one Weatherstack call the first time `pnpm seed` creates it.
export type SeedAddress = Readonly<{
  street: string;
  city: string;
  state: string;
  zipCode: string;
}>;

export const SEED_ADDRESSES: readonly SeedAddress[] = [
  // Colorado State Capitol
  { street: '200 E Colfax Ave', city: 'Denver', state: 'CO', zipCode: '80203' },
  // Texas State Capitol
  { street: '1100 Congress Ave', city: 'Austin', state: 'TX', zipCode: '78701' },
  // Space Needle
  { street: '400 Broad St', city: 'Seattle', state: 'WA', zipCode: '98109' },
  // Georgia State Capitol
  { street: '206 Washington St SW', city: 'Atlanta', state: 'GA', zipCode: '30334' },
  // Arizona Capitol Museum
  { street: '1700 W Washington St', city: 'Phoenix', state: 'AZ', zipCode: '85007' },
];
