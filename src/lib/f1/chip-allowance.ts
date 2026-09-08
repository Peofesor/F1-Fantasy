import { CHIP_LIST, type ChipAllowance } from "./chips";

/**
 * Reads a chip allowance out of submitted form fields named `chip_<id>`.
 *
 * A blank field means "the default", which is why it is left out of the map
 * rather than written as a number: storing a value would freeze today's default
 * into the league for ever.
 */
export function parseChipAllowance(formData: FormData): ChipAllowance | { error: string } {
  const allowance: ChipAllowance = {};

  for (const chip of CHIP_LIST) {
    const raw = String(formData.get(`chip_${chip.id}`) ?? "").trim();
    if (raw === "") continue;

    const count = Number(raw);
    if (!Number.isInteger(count) || count < 0 || count > 10) {
      return { error: `${chip.name}: give a whole number between 0 and 10, or leave it blank.` };
    }
    allowance[chip.id] = count;
  }

  return allowance;
}
