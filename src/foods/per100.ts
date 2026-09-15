import { scale, type Nutrients } from '../nutrients';
/** Label values for one serving of `basisGrams` become per 100 g: scale multiplies by grams/100, so 10000/basis is ×100/basis. */
export const toPer100 = (v: Nutrients, basisGrams: number) => scale(v, 10000 / basisGrams);
