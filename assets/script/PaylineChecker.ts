// PaylineChecker.ts
import { SymbolType, SymbolScore } from './SymbolConfig';

export type WinLine = { lineIndex: number; indices: number[]; symbol: SymbolType; score: number };

export class PaylineChecker {
  // 索引（0..8）對應格子位置：
  // 0 1 2
  // 3 4 5
  // 6 7 8
  public static paylines: number[][] = [
    [0,1,2], // 上
    [3,4,5], // 中
    [6,7,8], // 下
    [0,4,8], // 左上-右下
    [2,4,6], // 右上-左下
  ];

  public static check(symbols: SymbolType[]): WinLine[] {
    const wins: WinLine[] = [];
    for (let i = 0; i < this.paylines.length; i++) {
      const line = this.paylines[i];
      const [a,b,c] = line;
      if (!symbols[a] || !symbols[b] || !symbols[c]) continue;
      if (symbols[a] === symbols[b] && symbols[b] === symbols[c]) {
        const sym = symbols[a];
        wins.push({ lineIndex: i, indices: line, symbol: sym, score: SymbolScore[sym] });
      }
    }
    return wins;
  }
}