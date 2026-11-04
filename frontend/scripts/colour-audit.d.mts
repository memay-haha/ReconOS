export type ColourRole = 'text' | 'bg' | 'border';

export interface MockupColour {
  role: ColourRole;
  count: number;
  roles: Record<string, number>;
}

export function deltaE(a: string, b: string): number;
export function nearestToken(
  hex: string,
  role: string,
  tokens: Record<string, string>,
): { token: string; deltaE: number };
export function collectMockupColours(dir: string): Map<string, MockupColour>;
export function darkTokenValues(css: string): Record<string, string>;
