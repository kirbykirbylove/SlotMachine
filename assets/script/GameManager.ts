// GameManager.ts
import { _decorator, Component, Sprite, SpriteFrame, EditBox, Button, Label } from 'cc';
import { Reel } from './Reel';
import { UIManager } from './UIManager';
import { PaylineChecker, WinLine } from './PaylineChecker';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

enum GameState {
    IDLE = 'IDLE',
    SPINNING = 'SPINNING',
    STOPPING = 'STOPPING',
    PROCESSING_RESULTS = 'PROCESSING_RESULTS',
    PRESENTING = 'PRESENTING'
}

@ccclass('GameManager')
export class GameManager extends Component {
    @property([Reel])
    public reels: Reel[] = [];
    @property([Sprite])
    public cells: Sprite[] = [];
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
    @property public startDelayBetweenReels = 0.3; // 滾輪間各隔0.3秒開始轉動
    @property public stopDelayBetweenReels = 0.6;
    @property public autoStopDelay = 1;
    @property public stopImmediatelyDelayBetweenReels = 0.2;

    // 狀態管理
    private gameState: GameState = GameState.IDLE;
    private canStop = false;
    private immediateStopRequested = false;
    private customResult: SymbolType[] | null = null;
    private finalSymbols: SymbolType[] | null = null;
    private lastWins: WinLine[] = [];
    
    // 資源管理
    private spinTimeouts: Set<number> = new Set();
    private singleLineInterval: number | null = null;
    private presentationAbortController: AbortController | null = null;

    start() {
        this.bindEvents();
        this.changeState(GameState.IDLE);
        this.updateCellsDisplay(this.generateRandomSymbols());
    }

    private bindEvents() {
        this.spinButton.node.setSiblingIndex(-1);
        this.spinButton?.node.on('click', this.onSpinPressed, this);
        this.confirmButton?.node.on('click', this.onConfirmPressed, this);
    }

    private changeState(newState: GameState) {
        if (this.gameState === newState) return;
        this.gameState = newState;
        this.updateSpinInteractable();
    }

    public onConfirmPressed() {
        const parsed = this.parseEditBox();
        this.customResult = parsed;
        const message = parsed ? '自訂結果已設定！' : '輸入格式錯誤或已清除自訂結果';
        this.showMessage(message, 3);
    }

    public onSpinPressed() {
        if (this.gameState === GameState.PROCESSING_RESULTS || 
            this.gameState === GameState.PRESENTING) return;

        if (this.gameState === GameState.SPINNING && this.canStop) {
            this.immediateStopRequested = true;
            this.stopAllReels(true).catch(this.handleError);
        } else if (this.gameState === GameState.IDLE) {
            this.cleanup();
            this.startSpin();
        }
    }

    private async startSpin() {
        this.resetGameState();
        this.startReelsSequentially();
        this.scheduleAutoStop();
    }

    private cleanup() {
        this.stopSingleLinePresentation();
        this.clearAllTimeouts();
        this.abortPresentation();
        
        if (this.ui) {
            this.ui.clearLines();
            this.ui.updateScore(0);
            this.ui.showMessage('');
        }
    }

    private resetGameState() {
        this.finalSymbols = (this.customResult?.length === 9) 
            ? [...this.customResult] 
            : this.generateRandomSymbols();
        
        this.customResult = null;
        this.canStop = false;
        this.immediateStopRequested = false;
        this.changeState(GameState.SPINNING);
    }

    private startReelsSequentially() {
        this.reels.forEach((reel, i) => {
            if (!reel) return;

            const timeoutId = this.setTimeout(() => {
                if (this.gameState === GameState.SPINNING && !this.immediateStopRequested) {
                    const finalReelSymbols = this.getFinalReelSymbols(i);
                    reel.spin(3.0, finalReelSymbols).catch(this.handleError);
                    
                    if (i === 2) {
                        this.canStop = true;
                        this.updateSpinInteractable();
                    }
                }
            }, i * this.startDelayBetweenReels * 1000);
        });
    }

    private scheduleAutoStop() {
        const lastReelStartTime = (this.reels.length - 1) * this.startDelayBetweenReels * 1000;
        const autoStopTime = lastReelStartTime + (this.autoStopDelay * 1000);
        
        this.setTimeout(() => {
            if (this.gameState === GameState.SPINNING && !this.immediateStopRequested) {
                this.stopAllReels(false).catch(this.handleError);
            }
        }, autoStopTime);
    }

    private async stopAllReels(immediate: boolean) {
        this.changeState(GameState.STOPPING);
        
        const delay = immediate ? this.stopImmediatelyDelayBetweenReels : this.stopDelayBetweenReels;
        const stopPromises = this.createStopPromises(delay);
        
        if (stopPromises.length > 0) {
            const timeout = new Promise((_, reject) => 
                this.setTimeout(() => reject(new Error('停止超時')), 10000)
            );

            await Promise.race([Promise.all(stopPromises), timeout]);
        }

        if (!immediate) await this.sleep(100);
        this.finalizeSpin();
    }

    private createStopPromises(delay: number): Promise<void>[] {
        return this.reels.map((reel, i) => {
            if (!reel) return Promise.resolve();

            return new Promise<void>((resolve) => {
                this.setTimeout(() => {
                    try {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        if (reel.isSpinning()) {
                            reel.forceStop(finalReelSymbols, resolve, 0.1);
                        } else {
                            reel.setFinalResult(finalReelSymbols, resolve);
                        }
                    } catch (error) {
                        resolve();
                    }
                }, i * delay * 1000);
            });
        });
    }

    private finalizeSpin() {
        this.changeState(GameState.PROCESSING_RESULTS);
        this.canStop = false;

        if (this.finalSymbols?.length === 9) {
            this.updateCellsDisplay(this.finalSymbols);
        }

        this.processResultsAndPresentation();
    }

    private async processResultsAndPresentation() {
        if (!this.finalSymbols) return;

        this.changeState(GameState.PRESENTING);

        const wins: WinLine[] = PaylineChecker.check(this.finalSymbols);
        const totalScore = wins.reduce((sum, w) => sum + w.score, 0);
        
        this.lastWins = [...wins];
        this.ui?.updateScore(totalScore);

        if (wins.length === 0) {
            this.changeState(GameState.IDLE);
            return;
        }

        this.presentationAbortController = new AbortController();
        
        try {
            await this.presentWins(wins);
            this.changeState(GameState.IDLE);
            this.startSingleLinePresentation();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.handleError(error);
            }
        }
    }

    private async presentWins(wins: WinLine[]) {
        if (!this.ui) return;

        // 全線展演
        this.ui.clearLines();
        wins.forEach(w => this.ui!.showLine(w.lineIndex));

        const flashPromises = wins.map(w => 
            this.ui!.flashLineTwice(w.lineIndex).catch(() => {})
        );

        await Promise.race([
            Promise.all(flashPromises),
            this.sleep(1500)
        ]);

        // 檢查中斷
        if (this.presentationAbortController?.signal.aborted) {
            throw new Error('展演被中止');
        }

        // 單線輪播
        if (wins.length > 1) {
            for (const win of wins) {
                if (this.presentationAbortController?.signal.aborted) {
                    throw new Error('展演被中止');
                }
                
                this.ui.clearLines();
                this.ui.showLine(win.lineIndex);
                await this.sleep(1000);
            }

            this.ui.clearLines();
            wins.forEach(w => this.ui!.showLine(w.lineIndex));
        }
    }

    private startSingleLinePresentation() {
        if (!this.ui || this.lastWins.length === 0 || this.gameState !== GameState.IDLE) return;

        this.stopSingleLinePresentation();

        let currentIndex = 0;
        const showNextLine = () => {
            if (this.gameState !== GameState.IDLE) {
                this.stopSingleLinePresentation();
                return;
            }

            if (this.ui && this.lastWins.length > 0) {
                this.ui.clearLines();
                this.ui.showLine(this.lastWins[currentIndex].lineIndex);
                currentIndex = (currentIndex + 1) % this.lastWins.length;
            }
        };

        showNextLine();
        this.singleLineInterval = setInterval(showNextLine, 1000); //1500
    }

    private stopSingleLinePresentation() {
        if (this.singleLineInterval) {
            clearInterval(this.singleLineInterval);
            this.singleLineInterval = null;
        }
    }

    private abortPresentation() {
        if (this.presentationAbortController) {
            this.presentationAbortController.abort();
            this.presentationAbortController = null;
        }
    }

    private getFinalReelSymbols(reelIndex: number): SymbolType[] {
        if (!this.finalSymbols || this.finalSymbols.length !== 9) {
            return Array.from({length: 3}, () => 
                SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
            );
        }

        return [
            this.finalSymbols[reelIndex],
            this.finalSymbols[3 + reelIndex],
            this.finalSymbols[6 + reelIndex]
        ];
    }

    private setTimeout(callback: () => void, delay: number): number {
        const timeoutId = window.setTimeout(() => {
            this.spinTimeouts.delete(timeoutId);
            try {
                callback();
            } catch (error) {
                this.handleError(error);
            }
        }, delay);
        
        this.spinTimeouts.add(timeoutId);
        return timeoutId;
    }

    private clearAllTimeouts() {
        this.spinTimeouts.forEach(id => clearTimeout(id));
        this.spinTimeouts.clear();
    }

    private updateCellsDisplay(symbols: SymbolType[]) {
        if (!symbols || symbols.length !== 9) return;

        symbols.forEach((symbol, i) => {
            if (i < this.cells.length) {
                const symbolIndex = SymbolNames.indexOf(symbol);
                if (symbolIndex >= 0 && this.spriteFrames?.[symbolIndex]) {
                    try {
                        this.cells[i].spriteFrame = this.spriteFrames[symbolIndex];
                    } catch (e) { /* ignore */ }
                }
            }
        });
    }

    private parseEditBox(): SymbolType[] | null {
        if (!this.editBox?.string?.trim()) return null;

        const parts = this.editBox.string.trim().split(/[,|\s]+/).filter(Boolean);
        if (parts.length !== 9) return null;

        const symbols: SymbolType[] = [];
        for (const part of parts) {
            const symbol = part.toUpperCase() as SymbolType;
            if (!SymbolNames.includes(symbol)) return null;
            symbols.push(symbol);
        }
        return symbols;
    }

    private generateRandomSymbols(): SymbolType[] {
        return Array.from({length: 9}, () => 
            SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
        );
    }

    private updateSpinInteractable() {
        if (this.spinButton) {
            const canInteract = this.gameState === GameState.IDLE || 
                              (this.gameState === GameState.SPINNING && this.canStop);
            this.spinButton.interactable = canInteract;
        }

        if (this.spinButtonLabel) {
            switch (this.gameState) {
                case GameState.IDLE:
                    this.spinButtonLabel.string = "SPIN";
                    break;
                case GameState.SPINNING:
                    this.spinButtonLabel.string = this.canStop ? "STOP" : "Waiting";
                    break;
                case GameState.STOPPING:
                case GameState.PROCESSING_RESULTS:
                case GameState.PRESENTING:
                    this.spinButtonLabel.string = "SPIN";
                    break;
            }
        }
    }

    private showMessage(message: string, duration?: number) {
        if (this.ui) {
            this.ui.showMessage(message);
            if (duration) {
                this.scheduleOnce(() => this.ui?.showMessage(''), duration);
            }
        }
    }

    private handleError = (error: any) => {
        console.error('[GameManager] Error:', error);
        this.cleanup();
        this.changeState(GameState.IDLE);
        this.showMessage('遊戲發生錯誤，已重置', 3);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => this.setTimeout(resolve, ms));
    }

    onDestroy() {
        this.cleanup();
        this.abortPresentation();
    }
}

// // GameManager.ts -（修正所有潛在問題）
// import { _decorator, Component, Sprite, SpriteFrame, EditBox, Button, Label } from 'cc';
// import { Reel } from './Reel';
// import { UIManager } from './UIManager';
// import { PaylineChecker, WinLine } from './PaylineChecker';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// // 遊戲狀態枚舉
// enum GameState {
//     IDLE = 'IDLE',
//     SPINNING = 'SPINNING',
//     STOPPING = 'STOPPING',
//     PROCESSING_RESULTS = 'PROCESSING_RESULTS',
//     PRESENTING = 'PRESENTING'
// }

// @ccclass('GameManager')
// export class GameManager extends Component {
//     @property([Reel]) public reels: Reel[] = [];
//     @property([Sprite]) public cells: Sprite[] = [];
//     @property([SpriteFrame]) public spriteFrames: SpriteFrame[] = [];
//     @property(UIManager) public ui: UIManager | null = null;
//     @property(EditBox) public editBox: EditBox | null = null;
//     @property(Button) public confirmButton: Button | null = null;
//     @property(Button) public spinButton: Button | null = null;
//     @property(Label) public spinButtonLabel: Label | null = null;

//     // 時序配置
//     @property public startDelayBetweenReels = 0.5;
//     @property public stopDelayBetweenReels = 0.6;
//     @property public autoStopDelay = 0.8;
//     @property public stopImmediatelyDelayBetweenReels = 0.2;
//     @property public presentationTimeout = 3000; // 展演超時時間

//     // 集中式狀態管理
//     private gameState: GameState = GameState.IDLE;
//     private canStop = false;
//     private immediateStopRequested = false;
//     private customResult: SymbolType[] | null = null;
//     private finalSymbols: SymbolType[] | null = null;
//     private lastWins: WinLine[] = [];
    
//     // 資源管理
//     private spinTimeouts: Set<number> = new Set(); // 使用Set避免重複
//     private singleLineInterval: number | null = null;
//     private presentationAbortController: AbortController | null = null;

//     start() {
//         console.log('[GameManager] 初始化開始');

//         try {
//             this.bindEvents();
//             this.changeState(GameState.IDLE);
//             this.updateCellsDisplay(this.generateRandomSymbols());
//             console.log('[GameManager] 初始化完成');
//         } catch (error) {
//             console.error('[GameManager] 初始化失敗:', error);
//             this.handleError(error);
//         }
//     }

//     private bindEvents() {
//         if (this.spinButton) {
//             this.spinButton.node.setSiblingIndex(-1);
//             this.spinButton.node.on('click', this.onSpinPressed, this);
//         }
//         if (this.confirmButton) {
//             this.confirmButton.node.on('click', this.onConfirmPressed, this);
//         }
//     }

//     // 集中式狀態管理
//     private changeState(newState: GameState) {
//         if (this.gameState === newState) return;
        
//         console.log(`[GameManager] 狀態變更: ${this.gameState} -> ${newState}`);
//         this.gameState = newState;
//         this.updateSpinInteractable();
//     }

//     public onConfirmPressed() {
//         try {
//             const parsed = this.parseEditBox();
//             this.customResult = parsed;
//             const message = parsed ? '自訂結果已設定！' : '輸入格式錯誤或已清除自訂結果';
//             this.showMessage(message, 3);
//         } catch (error) {
//             console.error('[GameManager] 確認按鈕錯誤:', error);
//             this.showMessage('處理輸入時發生錯誤', 3);
//         }
//     }

//     public onSpinPressed() {
//         try {
//             // 防禦性檢查
//             if (this.gameState === GameState.PROCESSING_RESULTS || 
//                 this.gameState === GameState.PRESENTING) {
//                 console.log(`[GameManager] 忽略按鈕點擊，當前狀態: ${this.gameState}`);
//                 return;
//             }

//             if (this.gameState === GameState.SPINNING && this.canStop) {
//                 // 即停功能
//                 this.immediateStopRequested = true;
//                 this.stopAllReels(true).catch(error => this.handleError(error));
//             } else if (this.gameState === GameState.IDLE) {
//                 // 開始新局
//                 this.forceCleanup(); // 強制清理
//                 this.startSpin();
//             }
//         } catch (error) {
//             console.error('[GameManager] 按鈕點擊錯誤:', error);
//             this.handleError(error);
//         }
//     }

//     private async startSpin() {
//         try {
//             console.log('[GameManager] 開始 Spin 流程');

//             this.resetGameState();
//             this.startReelsSequentially();
//             this.scheduleAutoStop();
//         } catch (error) {
//             console.error('[GameManager] 開始滾動錯誤:', error);
//             this.handleError(error);
//         }
//     }

//     // 強制清理所有資源
//     private forceCleanup() {
//         console.log('[GameManager] 執行強制清理');
        
//         this.stopSingleLinePresentation();
//         this.clearAllTimeouts();
//         this.abortPresentation();
        
//         // 強制清除UI
//         if (this.ui) {
//             this.ui.clearLines();
//             this.ui.updateScore(0);
//             this.ui.showMessage('');
//         }

//         // 停止所有滾輪動畫
//         this.reels.forEach(reel => {
//             if (reel && typeof reel.stopRollingAnimation === 'function') {
//                 try {
//                     reel.stopRollingAnimation();
//                 } catch (e) {
//                     console.warn('[GameManager] 停止滾輪動畫失敗:', e);
//                 }
//             }
//         });
//     }

//     private resetGameState() {
//         this.finalSymbols = (this.customResult?.length === 9) 
//             ? [...this.customResult] 
//             : this.generateRandomSymbols();
        
//         this.customResult = null;
//         this.canStop = false;
//         this.immediateStopRequested = false;
//         this.changeState(GameState.SPINNING);
//     }

//     private startReelsSequentially() {
//         this.reels.forEach((reel, i) => {
//             if (!reel) {
//                 console.warn(`[GameManager] Reel ${i} 不存在`);
//                 return;
//             }

//             const timeoutId = window.setTimeout(() => {
//                 try {
//                     if (this.gameState === GameState.SPINNING && !this.immediateStopRequested) {
//                         const finalReelSymbols = this.getFinalReelSymbols(i);
//                         reel.spin(3.0, finalReelSymbols).catch(error => {
//                             console.error(`[GameManager] Reel ${i} 滾動錯誤:`, error);
//                         });
                        
//                         if (i === 2) { // 第三軸
//                             this.canStop = true;
//                             this.updateSpinInteractable();
//                             console.log('[GameManager] 第三軸開始轉動，現在可以按 STOP');
//                         }
//                     }
//                 } catch (error) {
//                     console.error(`[GameManager] 啟動 Reel ${i} 錯誤:`, error);
//                 }
                
//                 this.spinTimeouts.delete(timeoutId);
//             }, i * this.startDelayBetweenReels * 1000);

//             this.spinTimeouts.add(timeoutId);
//         });
//     }

//     private scheduleAutoStop() {
//         const lastReelStartTime = (this.reels.length - 1) * this.startDelayBetweenReels * 1000;
//         const autoStopTime = lastReelStartTime + (this.autoStopDelay * 1000);
        
//         const autoStopTimeoutId = window.setTimeout(() => {
//             try {
//                 if (this.gameState === GameState.SPINNING && !this.immediateStopRequested) {
//                     this.stopAllReels(false).catch(error => this.handleError(error));
//                 }
//             } catch (error) {
//                 console.error('[GameManager] 自動停止錯誤:', error);
//                 this.handleError(error);
//             }
            
//             this.spinTimeouts.delete(autoStopTimeoutId);
//         }, autoStopTime);

//         this.spinTimeouts.add(autoStopTimeoutId);
//     }

//     private async stopAllReels(immediate: boolean) {
//         try {
//             console.log(`[GameManager] ${immediate ? '立即' : '漸進式'}停止所有滾輪`);

//             this.changeState(GameState.STOPPING);
            
//             const delay = immediate ? this.stopImmediatelyDelayBetweenReels : this.stopDelayBetweenReels;
//             const stopPromises = this.createStopPromises(delay);
            
//             if (stopPromises.length > 0) {
//                 // 添加超時保護
//                 const timeoutPromise = this.sleep(10000); // 10秒超時
//                 const result = await Promise.race([
//                     Promise.all(stopPromises),
//                     timeoutPromise.then(() => {
//                         throw new Error('滾輪停止超時');
//                     })
//                 ]);
//             }

//             if (!immediate) {
//                 await this.sleep(100);
//             }

//             await this.finalizeSpin();
//         } catch (error) {
//             console.error('[GameManager] 停止滾輪錯誤:', error);
//             this.handleError(error);
//         }
//     }

//     private createStopPromises(delay: number): Promise<void>[] {
//         return this.reels.map((reel, i) => {
//             if (!reel) return Promise.resolve();

//             return new Promise<void>((resolve) => {
//                 const timeoutId = window.setTimeout(() => {
//                     try {
//                         const finalReelSymbols = this.getFinalReelSymbols(i);
                        
//                         if (reel.isSpinning()) {
//                             reel.forceStop(finalReelSymbols, () => resolve(), 0.1); // 減少延遲
//                         } else {
//                             reel.setFinalResult(finalReelSymbols, () => resolve());
//                         }
//                     } catch (error) {
//                         console.error(`[GameManager] 停止 Reel ${i} 錯誤:`, error);
//                         resolve(); // 即使出錯也要 resolve，避免卡住
//                     }
                    
//                     this.spinTimeouts.delete(timeoutId);
//                 }, i * delay * 1000);

//                 this.spinTimeouts.add(timeoutId);
//             });
//         });
//     }

//     private async finalizeSpin() {
//         try {
//             console.log('[GameManager] 完成 Spin，準備處理結果');

//             this.changeState(GameState.PROCESSING_RESULTS);
//             this.canStop = false;

//             // 驗證最終符號
//             if (!this.finalSymbols || this.finalSymbols.length !== 9) {
//                 console.error('[GameManager] 最終符號無效:', this.finalSymbols);
//                 this.finalSymbols = this.generateRandomSymbols();
//             }

//             this.updateCellsDisplay(this.finalSymbols);
//             await this.processResultsAndPresentation();
            
//         } catch (error) {
//             console.error('[GameManager] 完成滾動錯誤:', error);
//             this.handleError(error);
//         }
//     }

//     private async processResultsAndPresentation() {
//         try {
//             if (!this.finalSymbols) {
//                 throw new Error('最終符號為空');
//             }

//             this.changeState(GameState.PRESENTING);

//             const wins: WinLine[] = PaylineChecker.check(this.finalSymbols);
//             const totalScore = wins.reduce((sum, w) => sum + w.score, 0);
            
//             this.lastWins = [...wins];
//             this.ui?.updateScore(totalScore);

//             if (wins.length === 0) {
//                 this.changeState(GameState.IDLE);
//                 return;
//             }

//             // 創建中止控制器
//             this.presentationAbortController = new AbortController();
            
//             try {
//                 await this.presentWins(wins);
//             } catch (error) {
//                 if (error.name === 'AbortError') {
//                     console.log('[GameManager] 展演被中止');
//                     return;
//                 }
//                 throw error;
//             }

//             this.changeState(GameState.IDLE);
//             this.startSingleLinePresentation();
            
//         } catch (error) {
//             console.error('[GameManager] 處理結果錯誤:', error);
//             this.handleError(error);
//         }
//     }

//     private async presentWins(wins: WinLine[]) {
//         if (!this.ui) return;

//         // 全線展演
//         this.ui.clearLines();
//         wins.forEach(w => this.ui!.showLine(w.lineIndex));

//         // 閃爍動畫（帶超時保護）
//         const flashPromises = wins.map(w => {
//             return this.ui!.flashLineTwice(w.lineIndex).catch(error => {
//                 console.warn('[GameManager] 閃爍動畫錯誤:', error);
//             });
//         });

//         const flashTimeout = this.sleep(this.presentationTimeout);
        
//         await Promise.race([
//             Promise.all(flashPromises),
//             flashTimeout
//         ]);

//         // 檢查是否被中止
//         if (this.presentationAbortController?.signal.aborted) {
//             throw new Error('展演被中止');
//         }

//         // 單線輪播（多條線時）
//         if (wins.length > 1) {
//             for (const win of wins) {
//                 if (this.presentationAbortController?.signal.aborted) {
//                     throw new Error('展演被中止');
//                 }
                
//                 this.ui.clearLines();
//                 this.ui.showLine(win.lineIndex);
//                 await this.sleep(1000);
//             }

//             this.ui.clearLines();
//             wins.forEach(w => this.ui!.showLine(w.lineIndex));
//         }
//     }

//     private startSingleLinePresentation() {
//         if (!this.ui || this.lastWins.length === 0 || this.gameState !== GameState.IDLE) return;

//         this.stopSingleLinePresentation();

//         let currentIndex = 0;
//         const showNextLine = () => {
//             try {
//                 if (this.gameState !== GameState.IDLE) {
//                     this.stopSingleLinePresentation();
//                     return;
//                 }

//                 if (this.ui && this.lastWins.length > 0) {
//                     this.ui.clearLines();
//                     this.ui.showLine(this.lastWins[currentIndex].lineIndex);
//                     currentIndex = (currentIndex + 1) % this.lastWins.length;
//                 }
//             } catch (error) {
//                 console.error('[GameManager] 單線展演錯誤:', error);
//                 this.stopSingleLinePresentation();
//             }
//         };

//         showNextLine();
//         this.singleLineInterval = window.setInterval(showNextLine, 1500);
//     }

//     private stopSingleLinePresentation() {
//         if (this.singleLineInterval) {
//             clearInterval(this.singleLineInterval);
//             this.singleLineInterval = null;
//         }
//     }

//     private abortPresentation() {
//         if (this.presentationAbortController) {
//             this.presentationAbortController.abort();
//             this.presentationAbortController = null;
//         }
//     }

//     private getFinalReelSymbols(reelIndex: number): SymbolType[] {
//         if (!this.finalSymbols || this.finalSymbols.length !== 9) {
//             console.warn('[GameManager] 最終符號無效，生成隨機符號');
//             return Array.from({length: 3}, () => 
//                 SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//             );
//         }

//         return [
//             this.finalSymbols[reelIndex],
//             this.finalSymbols[3 + reelIndex],
//             this.finalSymbols[6 + reelIndex]
//         ];
//     }

//     private clearAllTimeouts() {
//         this.spinTimeouts.forEach(id => {
//             clearTimeout(id);
//         });
//         this.spinTimeouts.clear();
//     }

//     private updateCellsDisplay(symbols: SymbolType[]) {
//         if (!symbols || symbols.length !== 9) {
//             console.warn('[GameManager] 無效符號陣列:', symbols);
//             return;
//         }

//         symbols.forEach((symbol, i) => {
//             if (i < this.cells.length) {
//                 const symbolIndex = SymbolNames.indexOf(symbol);
//                 if (symbolIndex >= 0 && this.spriteFrames?.[symbolIndex]) {
//                     try {
//                         this.cells[i].spriteFrame = this.spriteFrames[symbolIndex];
//                     } catch (e) {
//                         console.warn(`[GameManager] 設定 cell ${i} 圖片失敗:`, e);
//                     }
//                 }
//             }
//         });
//     }

//     private parseEditBox(): SymbolType[] | null {
//         if (!this.editBox?.string?.trim()) return null;

//         const parts = this.editBox.string.trim()
//             .split(/[,|\s]+/)
//             .map(s => s.trim())
//             .filter(Boolean);

//         if (parts.length !== 9) {
//             console.warn('[GameManager] 輸入符號數量錯誤:', parts.length);
//             return null;
//         }

//         const symbols: SymbolType[] = [];
//         for (const part of parts) {
//             const symbol = part.toUpperCase() as SymbolType;
//             if (!SymbolNames.includes(symbol)) {
//                 console.warn('[GameManager] 無效符號:', part);
//                 return null;
//             }
//             symbols.push(symbol);
//         }
//         return symbols;
//     }

//     private generateRandomSymbols(): SymbolType[] {
//         return Array.from({length: 9}, () => 
//             SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//         );
//     }

//     private updateSpinInteractable() {
//         if (this.spinButton) {
//             const canInteract = this.gameState === GameState.IDLE || 
//                               (this.gameState === GameState.SPINNING && this.canStop);
//             this.spinButton.interactable = canInteract;
//         }

//         if (this.spinButtonLabel) {
//             switch (this.gameState) {
//                 case GameState.IDLE:
//                     this.spinButtonLabel.string = "SPIN";
//                     break;
//                 case GameState.SPINNING:
//                     this.spinButtonLabel.string = this.canStop ? "STOP" : "Waiting";
//                     break;
//                 case GameState.STOPPING:
//                 case GameState.PROCESSING_RESULTS:
//                 case GameState.PRESENTING:
//                     this.spinButtonLabel.string = "SPIN";
//                     break;
//             }
//         }
//     }

//     private showMessage(message: string, duration?: number) {
//         if (this.ui) {
//             this.ui.showMessage(message);
//             if (duration) {
//                 this.scheduleOnce(() => this.ui?.showMessage(''), duration);
//             }
//         }
//     }

//     private handleError(error: any) {
//         console.error('[GameManager] 處理錯誤:', error);
        
//         // 重置到安全狀態
//         this.forceCleanup();
//         this.changeState(GameState.IDLE);
//         this.showMessage('遊戲發生錯誤，已重置', 3);
//     }

//     private sleep(ms: number): Promise<void> {
//         return new Promise<void>((resolve) => {
//             const timeoutId = window.setTimeout(resolve, ms);
//             this.spinTimeouts.add(timeoutId);
            
//             // 清理超時ID
//             setTimeout(() => this.spinTimeouts.delete(timeoutId), ms + 100);
//         });
//     }

//     onDestroy() {
//         console.log('[GameManager] 銷毀');
//         this.forceCleanup();
//         this.abortPresentation();
//     }
// }