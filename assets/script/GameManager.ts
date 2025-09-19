// GameManager.ts
import { _decorator, Component, Sprite, SpriteFrame, EditBox, Button, Label } from 'cc';
import { Reel } from './Reel';
import { UIManager } from './UIManager';
import { PaylineChecker, WinLine } from './PaylineChecker';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

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
    @property
    public startDelayBetweenReels = 0.5; //0.7

    @property
    public stopDelayBetweenReels = 0.6; // 自動停止時每軸間的延遲 0.8

    @property
    public autoStopDelay = 0.8; // 第三軸啟動後多久開始自動停止 2.0

    // 核心狀態
    private isSpinning = false;
    private isProcessingResults = false;
    private immediateStopRequested = false;
    private canStop = false; // 是否允許按 STOP
    private customResult: SymbolType[] | null = null;
    private finalSymbols: SymbolType[] | null = null;
    private spinTimeouts: number[] = [];
    private lastWins: WinLine[] = [];
    private singleLineInterval: number | null = null;
    private stopImmediatelyDelayBetweenReels = 0.18;

    start() {
        console.log('[GameManager] 初始化開始');

        // 綁定按鈕事件
        if (this.spinButton) {
            this.spinButton.node.setSiblingIndex(-1);
            this.spinButton.node.on('click', this.onSpinPressed, this);
        }

        if (this.confirmButton) {
            this.confirmButton.node.on('click', this.onConfirmPressed, this);
        }

        this.updateSpinInteractable();
        this.updateCellsDisplay(this.generateRandomSymbols());

        console.log('[GameManager] 初始化完成');
    }

    public onConfirmPressed() {
        const parsed = this.parseEditBox();
        this.customResult = parsed;
        
        const message = parsed ? '自訂結果已設定！' : '輸入格式錯誤或已清除自訂結果';
        this.showMessage(message, 3);
    }

    public onSpinPressed() {
        if (this.isProcessingResults) return;

        if (this.isSpinning && this.canStop) {
            // 第三軸開始轉後才允許即停
            this.immediateStopRequested = true;
            this.stopAllReelsImmediately().catch(console.error);

        } else if (!this.isSpinning) {
            // 開始新局
            this.startSpin();
        }
        // 如果 isSpinning 但 canStop 為 false，則不做任何動作（等待第三軸啟動）
    }

    private async startSpin() {
        console.log('[GameManager] 開始 Spin 流程');

        this.stopSingleLinePresentation();
        this.clearAllTimeouts();
        this.clearUI();
        this.prepareGameState();
        this.startReelsSequentially();
        this.scheduleAutoStop();
    }

    // 準備遊戲狀態
    private prepareGameState() {
        this.finalSymbols = (this.customResult?.length === 9) 
            ? [...this.customResult] 
            : this.generateRandomSymbols();
        
        this.customResult = null;
        this.isSpinning = true;
        this.canStop = false; // 重置，等待第三軸啟動
        this.immediateStopRequested = false;
        this.isProcessingResults = false;
        this.updateSpinInteractable();
    }

    // 清除UI
    private clearUI() {
        if (this.ui) {
            this.ui.clearLines();
            this.ui.updateScore(0);
            this.ui.showMessage('');
        }
    }

    // 依序啟動滾輪
    private startReelsSequentially() {
        for (let i = 0; i < this.reels.length; i++) {
            const timeoutId = setTimeout(() => {
                if (this.isSpinning && !this.immediateStopRequested) {
                    const reel = this.reels[i];
                    if (reel) {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        reel.spin(3.0, finalReelSymbols).catch(console.error);
                        
                        // 第三軸（索引2）開始轉動時，允許按 STOP
                        if (i === 2) {
                            this.canStop = true;
                            this.updateSpinInteractable();
                            console.log('[GameManager] 第三軸開始轉動，現在可以按 STOP');
                        }
                    }
                }
            }, i * this.startDelayBetweenReels * 1000);

            this.spinTimeouts.push(timeoutId);
        }
    }

    // 安排自動停止
    private scheduleAutoStop() {
        const lastReelStartTime = (this.reels.length - 1) * this.startDelayBetweenReels * 1000;
        const autoStopTime = lastReelStartTime + (this.autoStopDelay * 1000);
        
        const autoStopTimeoutId = setTimeout(() => {
            if (this.isSpinning && !this.immediateStopRequested) {
                this.stopAllReelsGradually().catch(console.error);
            }
        }, autoStopTime);

        this.spinTimeouts.push(autoStopTimeoutId);
    }

    // // 立即停止所有滾輪
    // private async stopAllReelsImmediately() {
    //     console.log('[GameManager] 立即停止所有滾輪');

    //     this.clearAllTimeouts();
    //     const stopPromises = this.createStopPromises();
        
    //     if (stopPromises.length > 0) {
    //         await Promise.all(stopPromises);
    //     }

    //     this.finalizeSpin();
    // }

    // 立即停止所有滾輪V2
    private async stopAllReelsImmediately() {
        console.log('[GameManager] 立即停止所有滾輪');

        // this.clearAllTimeouts();
        // const stopPromises = this.createStopPromises();
        const stopPromises = this.createImmediatelyStopPromises();
        
        if (stopPromises.length > 0) {
            await Promise.all(stopPromises);
        }

        this.finalizeSpin();
    }

    // 漸進式停止滾輪
    private async stopAllReelsGradually() {
        console.log('[GameManager] 漸進式停止滾輪');

        const stopPromises = this.createGradualStopPromises();
        await Promise.all(stopPromises);
        await this.sleep(100); //120
        this.finalizeSpin();
    }

    // // 建立停止Promise陣列（立即停止）
    // private createStopPromises(): Promise<void>[] {
    //     return this.reels.map((reel, i) => {
    //         if (!reel) return Promise.resolve();

    //         const finalReelSymbols = this.getFinalReelSymbols(i);

    //         return new Promise<void>((resolve) => {
    //             try {
    //                 if (reel.isSpinning()) {
    //                     reel.forceStop(finalReelSymbols, () => resolve());
    //                 } else {
    //                     reel.setFinalResult(finalReelSymbols, () => resolve());
    //                 }
    //             } catch (e) {
    //                 console.warn('[GameManager] stop reel error:', e);
    //                 resolve();
    //             }
    //         });
    //     });
    // }
    
    // 建立停止Promise陣列（立即停止V2）
    private createImmediatelyStopPromises(): Promise<void>[] {
        return this.reels.map((reel, i) => {
            return new Promise<void>((resolve) => {
                const timeoutId = setTimeout(() => {
                    if (reel && reel.isSpinning()) {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        reel.forceStop(finalReelSymbols, () => resolve());
                    } else if (reel && !reel.isSpinning()) {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        reel.setFinalResult(finalReelSymbols, () => resolve());
                    } else {
                        resolve();
                    }
                }, i * this.stopImmediatelyDelayBetweenReels * 1000);

                this.spinTimeouts.push(timeoutId);
            });
        });
    }

    // 建立停止Promise陣列（漸進式停止）
    private createGradualStopPromises(): Promise<void>[] {
        return this.reels.map((reel, i) => {
            return new Promise<void>((resolve) => {
                const timeoutId = setTimeout(() => {
                    if (reel && reel.isSpinning()) {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        reel.forceStop(finalReelSymbols, () => resolve());
                    } else if (reel && !reel.isSpinning()) {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        reel.setFinalResult(finalReelSymbols, () => resolve());
                    } else {
                        resolve();
                    }
                }, i * this.stopDelayBetweenReels * 1000);

                this.spinTimeouts.push(timeoutId);
            });
        });
    }

    // 完成Spin並處理結果
    private async finalizeSpin() {
        console.log('[GameManager] 完成 Spin，準備處理結果');

        this.isSpinning = false;
        this.canStop = false; // 重置狀態

        if (this.finalSymbols) {
            this.updateCellsDisplay(this.finalSymbols);
        }

        await this.processResultsAndPresentation();
        this.updateSpinInteractable();
    }

    // 處理結果與展演
    private async processResultsAndPresentation() {
        if (!this.finalSymbols) return;

        this.isProcessingResults = true;
        this.updateSpinInteractable();

        const wins: WinLine[] = PaylineChecker.check(this.finalSymbols);
        const totalScore = wins.reduce((sum, w) => sum + w.score, 0);
        
        this.lastWins = [...wins];

        if (this.ui) {
            this.ui.updateScore(totalScore);
        }

        if (wins.length === 0) {
            this.isProcessingResults = false;
            this.updateSpinInteractable();
            return;
        }

        await this.showAllLinesPresentation(wins);
        await this.showSingleLinePresentation(wins);

        this.isProcessingResults = false;
        this.updateSpinInteractable();
        this.startSingleLinePresentation();
    }

    // 全線展演
    private async showAllLinesPresentation(wins: WinLine[]) {
        if (!this.ui) return;

        // 顯示所有線條並閃爍
        this.ui.clearLines();
        wins.forEach(w => this.ui!.showLine(w.lineIndex));

        const flashPromises = wins.map(w => {
            try {
                return this.ui!.flashLineTwice(w.lineIndex);
            } catch (e) {
                console.warn('[GameManager] flashLineTwice error:', e);
                return Promise.resolve();
            }
        }).filter(p => p && typeof p.then === 'function');

        await Promise.race([
            Promise.all(flashPromises),
            this.sleep(1500)
        ]);
    }

    // 單線輪播展演
    private async showSingleLinePresentation(wins: WinLine[]) {
        if (!this.ui || wins.length <= 1) return;

        for (let i = 0; i < wins.length; i++) {
            this.ui.clearLines();
            this.ui.showLine(wins[i].lineIndex);
            await this.sleep(1000);
        }

        // 最後再次顯示所有線條
        this.ui.clearLines();
        wins.forEach(w => this.ui!.showLine(w.lineIndex));
    }

    // 開始跑單線展演
    private startSingleLinePresentation() {
        if (!this.ui || this.lastWins.length === 0) return;

        this.stopSingleLinePresentation();

        let currentIndex = 0;
        const showNextLine = () => {
            if (this.isSpinning || this.isProcessingResults) {
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
        this.singleLineInterval = setInterval(showNextLine, 1500); //1000
    }

    // 停止跑單線展演
    private stopSingleLinePresentation() {
        if (this.singleLineInterval) {
            clearInterval(this.singleLineInterval);
            this.singleLineInterval = null;
        }
    }

    // 獲取指定滾輪的最終符號
    private getFinalReelSymbols(reelIndex: number): SymbolType[] {
        if (!this.finalSymbols) {
            return Array.from({length: 3}, () => 
                SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
            );
        }

        return [
            this.finalSymbols[reelIndex],           // 上排
            this.finalSymbols[3 + reelIndex],       // 中排
            this.finalSymbols[6 + reelIndex]        // 下排
        ];
    }

    // 清除所有定時器
    private clearAllTimeouts() {
        this.spinTimeouts.forEach(id => clearTimeout(id));
        this.spinTimeouts = [];
    }

    // 更新全局cells顯示
    private updateCellsDisplay(symbols: SymbolType[]) {
        if (!symbols || symbols.length < 9) return;

        for (let i = 0; i < Math.min(9, this.cells.length); i++) {
            const symbolIndex = SymbolNames.indexOf(symbols[i]);
            if (symbolIndex >= 0 && this.spriteFrames?.[symbolIndex]) {
                try {
                    this.cells[i].spriteFrame = this.spriteFrames[symbolIndex];
                } catch (e) {
                    console.warn(`[GameManager] failed to set spriteFrame for cell ${i}`, e);
                }
            }
        }
    }

    // 解析EditBox輸入
    private parseEditBox(): SymbolType[] | null {
        if (!this.editBox) return null;

        const raw = (this.editBox.string || '').trim();
        if (!raw) return null;

        const parts = raw.split(/[,|\s]+/).map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length !== 9) {
            console.warn('[GameManager] EditBox input must contain exactly 9 symbols, got:', parts.length);
            return null;
        }

        const symbols: SymbolType[] = [];
        for (const part of parts) {
            const symbol = part.toUpperCase();
            if (!['A', 'B', 'C'].includes(symbol)) {
                console.warn('[GameManager] Invalid symbol in EditBox:', part);
                return null;
            }
            symbols.push(symbol as SymbolType);
        }
        return symbols;
    }

    // 產生隨機符號
    private generateRandomSymbols(): SymbolType[] {
        return Array.from({length: 9}, () => 
            SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
        );
    }

    // 更新按鈕狀態
    private updateSpinInteractable() {
        if (this.spinButton) {
            // 展演中不可按，其他時候都可按
            this.spinButton.interactable = !this.isProcessingResults;
        }

        if (this.spinButtonLabel) {
            if (this.isProcessingResults) {
                this.spinButtonLabel.string = "SPIN";
            } else if (this.isSpinning && this.canStop) {
                this.spinButtonLabel.string = "STOP";
            } else if (this.isSpinning && !this.canStop) {
                this.spinButtonLabel.string = "Waiting"; // 等待第三軸啟動
            } else {
                this.spinButtonLabel.string = "SPIN";
            }
        }
    }

    // 顯示訊息
    private showMessage(message: string, duration?: number) {
        if (this.ui) {
            this.ui.showMessage(message);
            if (duration) {
                this.scheduleOnce(() => this.ui?.showMessage(''), duration);
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise<void>(res => setTimeout(res, ms));
    }

    onDestroy() {
        this.clearAllTimeouts();
        this.stopSingleLinePresentation();
    }
}
