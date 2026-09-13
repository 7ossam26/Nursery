export type Piastres = bigint & { readonly __brand: 'Piastres' };
export const piastres = (value: bigint): Piastres => value as Piastres;
export const addPiastres = (...values: readonly Piastres[]): Piastres => piastres(values.reduce((sum, value) => sum + value, 0n));
export const toPiastresJson = (value: Piastres): string => value.toString();
