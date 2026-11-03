export interface TokenRow {
  group: string | null;
  name: string;
  values: Record<string, string>;
}

export function parseTokenTable(markdown: string): TokenRow[];
export function generateCss(markdown: string): string;
