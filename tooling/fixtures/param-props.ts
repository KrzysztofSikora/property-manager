// NFR-04: parameter properties are not erasable syntax; tsc must report TS1294.
export class Point {
  constructor(public readonly x: number) {}
}
