// GameManager.ts - 修正即停功能和自然結果展演
import { _decorator, Component, Sprite, SpriteFrame, EditBox, Button, Label } from 'cc';
import { Reel } from './Reel';
import { UIManager } from './UIManager';
import { PaylineChecker, WinLine } from './PaylineChecker';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property([Reel])
    public reels: Reel[] = []; // 3 個 Reel

    @property([Sprite])
    public cells: Sprite[] = []; // 用於連線檢查的顯示

    @property([SpriteFrame])
    public spriteFrames: SpriteFrame[] = [];

    @property(UIManager)
    public ui: UIManager | null = null;

    @property(EditBox)
    public editBox: EditBox | null = null;

    @property(Button)
    public confirmButton: Button | null = null;

    @property(Button)
    public spinButton: Button | null = null;

    @property(Label)
    public spinButtonLabel: Label | null = null;

    // 時序配置
    @property
    public startDelayBetweenReels = 0.3; // 每軸啟動的延遲（秒）

    @property
    public stopDelayBetweenReels = 0.4; // 每軸停止的延遲（秒）

    @property
    public reelSpinDuration = 3.0; // Reel 滾動持續時間

    @property
    public autoStopDelay = 2.0; // 自動停止延遲

    // 內部狀態
    private isSpinning = false;
    private isProcessingResults = false;
    private immediateStopRequested = false;
    private customResult: SymbolType[] | null = null;
    private finalSymbols: SymbolType[] | null = null;
    private spinTimeouts: number[] = []; // 存儲所有 setTimeout ID

    start() {
        console.log('[GameManager] GameManager 初始化開始');

        if (this.spinButton) {
            this.spinButton.node.on('click', this.onSpinPressed, this);
        }

        if (this.confirmButton) {
            this.confirmButton.node.on('click', this.onConfirmPressed, this);
        }

        this.updateSpinInteractable();
        this.initializeDisplay();

        console.log('[GameManager] GameManager 初始化完成');
    }

    private initializeDisplay() {
        const initialSymbols = this.generateRandomSymbols();
        this.updateCellsDisplay(initialSymbols);
    }

    public onConfirmPressed() {
        const parsed = this.parseEditBox();
        if (parsed) {
            this.customResult = parsed;
            if (this.ui) {
                this.ui.showMessage('自訂結果已設定！');
            }
        } else {
            this.customResult = null;
            if (this.ui) {
                this.ui.showMessage('輸入格式錯誤或已清除自訂結果');
            }
        }

        this.scheduleOnce(() => {
            if (this.ui) {
                this.ui.showMessage('');
            }
        }, 3);
    }

    public onSpinPressed() {
        if (this.isProcessingResults) {
            return;
        }

        if (this.isSpinning) {
            // 按下STOP按鈕
            this.immediateStopRequested = true;
            this._stopAllReelsImmediately();
            return;
        }

        this.startSpin();
    }

    private async startSpin() {
        console.log('[GameManager] 開始 Spin 流程');

        // 清除所有之前的定時器
        this.clearAllTimeouts();

        // 清除前一局畫面與分數
        if (this.ui) {
            this.ui.clearLines();
            this.ui.updateScore(0);
            this.ui.showMessage('');
        }

        // 準備最終結果
        if (this.customResult && this.customResult.length === 9) {
            this.finalSymbols = [...this.customResult];
            this.customResult = null;
        } else {
            this.finalSymbols = this.generateRandomSymbols();
        }

        this.isSpinning = true;
        this.immediateStopRequested = false;
        this.isProcessingResults = false;
        this.updateSpinInteractable();

        // 依序啟動滾輪
        for (let i = 0; i < this.reels.length; i++) {
            const timeoutId = setTimeout(() => {
                if (this.isSpinning && !this.immediateStopRequested) {
                    const reel = this.reels[i];
                    if (reel) {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        reel.spin(this.reelSpinDuration, finalReelSymbols).catch(console.error);
                    }
                }
            }, i * this.startDelayBetweenReels * 1000);
            
            this.spinTimeouts.push(timeoutId);
        }

        // 設置自動停止時間
        const autoStopTime = ((this.reels.length - 1) * this.startDelayBetweenReels + this.autoStopDelay) * 1000;
        const autoStopTimeoutId = setTimeout(() => {
            if (this.isSpinning && !this.immediateStopRequested) {
                this._stopAllReelsGradually();
            }
        }, autoStopTime);
        
        this.spinTimeouts.push(autoStopTimeoutId);
    }

    // 立即停止所有滾輪（按STOP按鈕）
    private _stopAllReelsImmediately() {
        console.log('[GameManager] 立即停止所有滾輪');
        
        this.clearAllTimeouts();
        
        // 同時停止所有滾輪
        for (let i = 0; i < this.reels.length; i++) {
            const reel = this.reels[i];
            if (reel && reel.isSpinning()) {
                const finalReelSymbols = this.getFinalReelSymbols(i);
                reel.forceStop(finalReelSymbols);
            }
        }

        this.finalizeSpin();
    }

    // 漸進式停止滾輪（自動停止）
    private _stopAllReelsGradually() {
        console.log('[GameManager] 漸進式停止滾輪');
        
        // 依序停止滾輪，製造自然的停止效果
        for (let i = 0; i < this.reels.length; i++) {
            const timeoutId = setTimeout(() => {
                const reel = this.reels[i];
                if (reel && reel.isSpinning()) {
                    const finalReelSymbols = this.getFinalReelSymbols(i);
                    reel.forceStop(finalReelSymbols);
                    
                    // 如果是最後一個滾輪，完成spin
                    if (i === this.reels.length - 1) {
                        setTimeout(() => {
                            this.finalizeSpin();
                        }, 500); // 等待最後的動畫完成
                    }
                }
            }, i * this.stopDelayBetweenReels * 1000);
            
            this.spinTimeouts.push(timeoutId);
        }
    }

    // 完成 Spin 並處理結果
    private async finalizeSpin() {
        this.isSpinning = false;
        this.updateSpinInteractable();

        // 更新 cells 顯示
        if (this.finalSymbols) {
            this.updateCellsDisplay(this.finalSymbols);
        }

        // 處理結果展演
        await this._processResultsAndPresentation();
    }

    // 獲取指定滾輪的最終符號
    private getFinalReelSymbols(reelIndex: number): SymbolType[] {
        if (!this.finalSymbols) {
            return [
                SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
                SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
                SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
            ];
        }

        return [
            this.finalSymbols[reelIndex],           // 上排
            this.finalSymbols[3 + reelIndex],       // 中排
            this.finalSymbols[6 + reelIndex]        // 下排
        ];
    }

    // 清除所有定時器
    private clearAllTimeouts() {
        for (const timeoutId of this.spinTimeouts) {
            clearTimeout(timeoutId);
        }
        this.spinTimeouts = [];
    }

    private updateCellsDisplay(symbols: SymbolType[]) {
        if (!symbols || symbols.length < 9) return;

        for (let i = 0; i < Math.min(9, this.cells.length); i++) {
            const sym = symbols[i];
            const idx = SymbolNames.indexOf(sym);
            if (idx >= 0 && this.spriteFrames && this.spriteFrames[idx]) {
                try {
                    this.cells[i].spriteFrame = this.spriteFrames[idx];
                } catch (e) {
                    console.warn(`[GameManager] failed to set spriteFrame for cell ${i}`, e);
                }
            }
        }
    }

    private async _processResultsAndPresentation() {
        if (!this.finalSymbols) return;

        this.isProcessingResults = true;
        this.updateSpinInteractable();

        const wins: WinLine[] = PaylineChecker.check(this.finalSymbols);
        let total = 0;
        for (const w of wins) total += w.score;

        if (this.ui) {
            this.ui.updateScore(total);
        }

        if (wins.length === 0) {
            this.isProcessingResults = false;
            this.updateSpinInteractable();
            return;
        }

        // 展演邏輯保持不變
        if (this.ui) {
            this.ui.clearLines();
            for (const w of wins) {
                this.ui.showLine(w.lineIndex);
            }

            const flashPromises: Promise<void>[] = [];
            for (const w of wins) {
                try {
                    const p = this.ui.flashLineTwice(w.lineIndex);
                    if (p && typeof p.then === 'function') {
                        flashPromises.push(p);
                    }
                } catch (e) {
                    console.warn('[GameManager] flashLineTwice error:', e);
                }
            }

            await Promise.race([
                Promise.all(flashPromises),
                this.sleep(1500)
            ]);
        } else {
            await this.sleep(1500);
        }

        if (this.ui && wins.length > 1) {
            for (let i = 0; i < wins.length; i++) {
                this.ui.clearLines();
                this.ui.showLine(wins[i].lineIndex);
                await this.sleep(1000);
            }

            this.ui.clearLines();
            for (const w of wins) {
                this.ui.showLine(w.lineIndex);
            }
        }

        this.isProcessingResults = false;
        this.updateSpinInteractable();
    }

    private parseEditBox(): SymbolType[] | null {
        if (!this.editBox) return null;

        const raw = (this.editBox.string || '').trim();
        if (!raw) return null;

        const parts = raw.split(/[,|\s]+/).map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length !== 9) {
            console.warn('[GameManager] EditBox input must contain exactly 9 symbols, got:', parts.length);
            return null;
        }

        const arr: SymbolType[] = [];
        for (const p of parts) {
            const up = p.toUpperCase();
            if (!['A', 'B', 'C'].includes(up)) {
                console.warn('[GameManager] Invalid symbol in EditBox:', p);
                return null;
            }
            arr.push(up as SymbolType);
        }
        return arr;
    }

    private generateRandomSymbols(): SymbolType[] {
        const out: SymbolType[] = [];
        for (let i = 0; i < 9; i++) {
            const idx = Math.floor(Math.random() * SymbolNames.length);
            out.push(SymbolNames[idx]);
        }
        return out;
    }

    private updateSpinInteractable() {
        if (this.spinButton) {
            this.spinButton.interactable = !this.isProcessingResults;
        }

        if (this.spinButtonLabel) {
            if (this.isSpinning) {
                this.spinButtonLabel.string = "STOP";
            } else {
                this.spinButtonLabel.string = "SPIN";
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise<void>(res => setTimeout(res, ms));
    }

    onDestroy() {
        this.clearAllTimeouts();
    }
}

// // GameManager.ts - 修正展演邏輯和滾輪系統
// import { _decorator, Component, Sprite, SpriteFrame, EditBox, Button, Label } from 'cc';
// import { Reel } from './Reel';
// import { UIManager } from './UIManager';
// import { PaylineChecker, WinLine } from './PaylineChecker';
// import { SymbolType, SymbolNames } from './SymbolConfig';
// const { ccclass, property } = _decorator;

// @ccclass('GameManager')
// export class GameManager extends Component {
//   @property([Reel])
//   public reels: Reel[] = []; // 3 個 Reel，每個包含 3 個 Cell

//   // 這些 cells 現在主要用於顯示最終結果和連線檢查
//   @property([Sprite])
//   public cells: Sprite[] = []; // 仍保留用於連線檢查的顯示

//   @property([SpriteFrame])
//   public spriteFrames: SpriteFrame[] = [];

//   @property(UIManager)
//   public ui: UIManager | null = null;

//   @property(EditBox)
//   public editBox: EditBox | null = null;

//   @property(Button)
//   public confirmButton: Button | null = null;

//   @property(Button)
//   public spinButton: Button | null = null;
  
//   @property(Label)
//   public spinButtonLabel: Label | null = null;

//   // timing config
//   @property
//   public startDelayBetweenReels = 0.3; // 每軸啟動的延遲（秒）

//   @property
//   public delayAfterAllStartedBeforeStopping = 1.0; // 所有軸啟動後，開始停止的延遲（秒）

//   @property
//   public reelSpinDuration = 3.0; // Reel 滾動持續時間

//   // internal state
//   private isSpinning = false;
//   private isProcessingResults = false;
//   private immediateStopRequested = false;
//   private scheduledStopCalled = false;
//   private customResult: SymbolType[] | null = null;

//   // the final 9-symbol result for this round (row-major 0..8)
//   private finalSymbols: SymbolType[] | null = null;

//   start() {
//     console.log('[GameManager] GameManager 初始化開始');
    
//     if (this.spinButton) {
//       this.spinButton.node.on('click', this.onSpinPressed, this);
//       console.log('[GameManager] SPIN 按鈕事件已綁定');
//     } else {
//       console.error('[GameManager] SPIN 按鈕未綁定!');
//     }
    
//     if (this.confirmButton) {
//       this.confirmButton.node.on('click', this.onConfirmPressed, this);
//       console.log('[GameManager] 確認按鈕事件已綁定');
//     } else {
//       console.warn('[GameManager] 確認按鈕未綁定');
//     }
    
//     // 檢查關鍵綁定
//     console.log(`[GameManager] Reels 數量: ${this.reels.length}`);
//     console.log(`[GameManager] Cells 數量: ${this.cells.length}`);
//     console.log(`[GameManager] SpriteFrames 數量: ${this.spriteFrames.length}`);
    
//     for (let i = 0; i < this.reels.length; i++) {
//       if (!this.reels[i]) {
//         console.error(`[GameManager] Reel ${i} 未綁定!`);
//       }
//     }
    
//     this.updateSpinInteractable();
//     this.initializeDisplay();
    
//     console.log('[GameManager] GameManager 初始化完成');
//   }

//   private initializeDisplay() {
//     const initialSymbols = this.generateRandomSymbols();
//     this.updateCellsDisplay(initialSymbols);
//   }

//   public onConfirmPressed() {
//     const parsed = this.parseEditBox();
//     if (parsed) {
//       this.customResult = parsed;
//       if (this.ui) {
//         this.ui.showMessage('自訂結果已設定！');
//       }
//     } else {
//       this.customResult = null;
//       if (this.ui) {
//         this.ui.showMessage('輸入格式錯誤或已清除自訂結果');
//       }
//     }
    
//     this.scheduleOnce(() => {
//       if (this.ui) {
//         this.ui.showMessage('');
//       }
//     }, 3);
//   }

//   public onSpinPressed() {
//     if (this.isProcessingResults) {
//       return;
//     }

//     if (this.isSpinning) {
//       this.immediateStopRequested = true;
//       this._stopAllReelsNow();
//       return;
//     }

//     // 直接開始新的 spin，不需要等單線展演
//     this.startSpin();
//   }

//   private async startSpin() {
//     console.log('[GameManager] 開始 Spin 流程');
    
//     // 清除前一局畫面與分數
//     if (this.ui) {
//       this.ui.clearLines();
//       this.ui.updateScore(0);
//       this.ui.showMessage('');
//     }

//     // 使用自訂結果或生成隨機結果
//     if (this.customResult && this.customResult.length === 9) {
//       this.finalSymbols = [...this.customResult];
//       this.customResult = null;
//       console.log('[GameManager] 使用自訂結果:', this.finalSymbols);
//     } else {
//       this.finalSymbols = this.generateRandomSymbols();
//       console.log('[GameManager] 使用隨機結果:', this.finalSymbols);
//     }

//     this.isSpinning = true;
//     this.immediateStopRequested = false;
//     this.scheduledStopCalled = false;
//     this.isProcessingResults = false;
//     this.updateSpinInteractable();

//     console.log(`[GameManager] 準備啟動 ${this.reels.length} 個滾輪`);

//     // 依序啟動三個滾輪（間隔 0.3 秒）
//     for (let i = 0; i < this.reels.length; i++) {
//       const reel = this.reels[i];
      
//       if (!reel) {
//         console.error(`[GameManager] Reel ${i} 未綁定!`);
//         continue;
//       }
      
//       // 計算這個 reel 對應的最終符號（column i 的上中下三個符號）
//       const finalReelSymbols: SymbolType[] = this.finalSymbols ? [
//         this.finalSymbols[i],     // 上排
//         this.finalSymbols[3 + i], // 中排
//         this.finalSymbols[6 + i]  // 下排
//       ] : undefined;

//       console.log(`[GameManager] 將在 ${i * this.startDelayBetweenReels} 秒後啟動 Reel ${i}，目標符號:`, finalReelSymbols);

//       setTimeout(() => {
//         console.log(`[GameManager] 正在啟動 Reel ${i}`);
//         try {
//           reel.spin(this.reelSpinDuration, finalReelSymbols).catch((err) => {
//             console.error(`[GameManager] Reel ${i} spin 錯誤:`, err);
//           });
//         } catch (e) {
//           console.error(`[GameManager] Reel ${i} spin 拋出異常:`, e);
//         }
//       }, i * this.startDelayBetweenReels * 1000);
//     }

//     // 計算停止時間：最後一個滾輪啟動時間 + 等待時間
//     const lastStartDelay = (Math.max(0, this.reels.length - 1)) * this.startDelayBetweenReels;
//     const stopScheduleTime = (lastStartDelay + this.delayAfterAllStartedBeforeStopping) * 1000;

//     console.log(`[GameManager] 將在 ${stopScheduleTime/1000} 秒後自動停止所有滾輪`);

//     setTimeout(() => {
//       if (!this.scheduledStopCalled && this.isSpinning) {
//         console.log('[GameManager] 執行排程停止');
//         this.scheduledStopCalled = true;
//         if (!this.immediateStopRequested) {
//           this._stopAllReelsNow();
//         }
//       }
//     }, stopScheduleTime);
//   }

//   private async _stopAllReelsNow() {
//     if (!this.isSpinning) return;

//     this.unscheduleAllCallbacks();
//     this.scheduledStopCalled = true;

//     // 依序停止滾輪（可以考慮加上小延遲讓停止更自然）
//     for (let c = 0; c < this.reels.length; c++) {
//       const reel = this.reels[c];
      
//       const finalReelSymbols: SymbolType[] = this.finalSymbols ? [
//         this.finalSymbols[c],     // 上排
//         this.finalSymbols[3 + c], // 中排
//         this.finalSymbols[6 + c]  // 下排
//       ] : undefined;

//       try {
//         reel.forceStop(finalReelSymbols);
//       } catch (e) {
//         console.warn('[GameManager] reel.forceStop error:', e);
//       }
//     }

//     // 同步更新 cells 顯示（用於連線檢查）
//     if (this.finalSymbols) {
//       this.updateCellsDisplay(this.finalSymbols);
//     } else {
//       this.finalSymbols = this.generateRandomSymbols();
//       this.updateCellsDisplay(this.finalSymbols);
//     }

//     this.isSpinning = false;
//     this.updateSpinInteractable();

//     // 檢查並處理連線結果
//     await this._processResultsAndPresentation();
//   }

//   private updateCellsDisplay(symbols: SymbolType[]) {
//     if (!symbols || symbols.length < 9) return;
//     for (let i = 0; i < Math.min(9, this.cells.length); i++) {
//       const sym = symbols[i];
//       const idx = SymbolNames.indexOf(sym);
//       if (idx >= 0 && this.spriteFrames && this.spriteFrames[idx]) {
//         try {
//           this.cells[i].spriteFrame = this.spriteFrames[idx];
//         } catch (e) {
//           console.warn(`[GameManager] failed to set spriteFrame for cell ${i}`, e);
//         }
//       }
//     }
//   }

//   // 修正：完整的展演流程，不等玩家按 SPIN
//   private async _processResultsAndPresentation() {
//     if (!this.finalSymbols) return;

//     this.isProcessingResults = true;
//     this.updateSpinInteractable();

//     // 檢查中獎線
//     const wins: WinLine[] = PaylineChecker.check(this.finalSymbols);
//     let total = 0;
//     for (const w of wins) total += w.score;

//     if (this.ui) {
//       this.ui.updateScore(total);
//     }

//     if (wins.length === 0) {
//       // 無中獎：立即結束
//       this.isProcessingResults = false;
//       this.updateSpinInteractable();
//       return;
//     }

//     // === 第一階段：全線展演（顯示所有中獎線並閃爍） ===
//     if (this.ui) {
//       this.ui.clearLines();
//       for (const w of wins) {
//         this.ui.showLine(w.lineIndex);
//       }

//       // 同時對所有中獎線執行閃爍
//       const flashPromises: Promise<void>[] = [];
//       for (const w of wins) {
//         try {
//           const p = this.ui.flashLineTwice(w.lineIndex);
//           if (p && typeof p.then === 'function') {
//             flashPromises.push(p);
//           }
//         } catch (e) {
//           console.warn('[GameManager] flashLineTwice error:', e);
//         }
//       }

//       // 等待 1.5 秒和所有閃爍完成
//       await Promise.race([
//         Promise.all(flashPromises),
//         this.sleep(1500)
//       ]);
//     } else {
//       await this.sleep(1500);
//     }

//     // === 第二階段：個別展演（每條線單獨顯示 1 秒） ===
//     if (this.ui && wins.length > 1) { // 只有多條線時才需要個別展演
//       for (let i = 0; i < wins.length; i++) {
//         this.ui.clearLines();
//         this.ui.showLine(wins[i].lineIndex);
//         await this.sleep(1000);
//       }
      
//       // 最後恢復顯示所有中獎線
//       this.ui.clearLines();
//       for (const w of wins) {
//         this.ui.showLine(w.lineIndex);
//       }
//     }

//     this.isProcessingResults = false;
//     this.updateSpinInteractable();
//   }

//   private parseEditBox(): SymbolType[] | null {
//     if (!this.editBox) return null;
//     const raw = (this.editBox.string || '').trim();
//     if (!raw) return null;

//     const parts = raw.split(/[,|\s]+/).map(s => s.trim()).filter(s => s.length > 0);
//     if (parts.length !== 9) {
//       console.warn('[GameManager] EditBox input must contain exactly 9 symbols, got:', parts.length);
//       return null;
//     }

//     const arr: SymbolType[] = [];
//     for (const p of parts) {
//       const up = p.toUpperCase();
//       if (!['A', 'B', 'C'].includes(up)) {
//         console.warn('[GameManager] Invalid symbol in EditBox:', p);
//         return null;
//       }
//       arr.push(up as SymbolType);
//     }
//     return arr;
//   }

//   private generateRandomSymbols(): SymbolType[] {
//     const out: SymbolType[] = [];
//     for (let i = 0; i < 9; i++) {
//       const idx = Math.floor(Math.random() * SymbolNames.length);
//       out.push(SymbolNames[idx]);
//     }
//     return out;
//   }

//   private updateSpinInteractable() {
//     if (this.spinButton) {
//       this.spinButton.interactable = !this.isProcessingResults;
//     }
    
//     // 更新按鈕文字
//     if (this.spinButtonLabel) {
//       if (this.isSpinning) {
//         this.spinButtonLabel.string = "STOP";
//       } else {
//         this.spinButtonLabel.string = "SPIN";
//       }
//     }
//   }

//   private sleep(ms: number): Promise<void> {
//     return new Promise<void>(res => setTimeout(res, ms));
//   }
// }
