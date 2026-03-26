/**
 * PaletteSwap — Predefined color palettes for agent characters.
 * 8 color schemes, each with a body color and hat color.
 */

export interface CharacterPalette {
  body: number;
  hat: number;
  label: string;
}

const PALETTES: CharacterPalette[] = [
  { body: 0x4a90d9, hat: 0x2c5f9e, label: "Blue" },
  { body: 0xd94a4a, hat: 0x9e2c2c, label: "Red" },
  { body: 0x4ad94a, hat: 0x2c9e2c, label: "Green" },
  { body: 0xd9b44a, hat: 0x9e7a2c, label: "Gold" },
  { body: 0x9b59b6, hat: 0x6c3483, label: "Purple" },
  { body: 0xe67e22, hat: 0xa85e16, label: "Orange" },
  { body: 0x1abc9c, hat: 0x148f77, label: "Teal" },
  { body: 0xe84393, hat: 0xb92d6f, label: "Pink" },
];

/**
 * Get a palette by agent index (wraps around).
 */
export function getPalette(index: number): CharacterPalette {
  return PALETTES[index % PALETTES.length];
}

/**
 * Total number of available palettes.
 */
export const PALETTE_COUNT = PALETTES.length;
