// NFR-04: a type imported without `import type` must fail with TS1484.
import { Shape } from './types.ts';

export const describe = (shape: Shape): string => shape.name;
