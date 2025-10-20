// SymbolConfig.ts
export enum SymbolType {
  A = 'A',
  B = 'B',
  C = 'C',
}

export const SymbolScore: Record<SymbolType, number> = {
  [SymbolType.A]: 3,
  [SymbolType.B]: 2,
  [SymbolType.C]: 1,
};

export const SymbolNames: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
