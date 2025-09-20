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
    @property public startDelayBetweenReels = 0.5;
    @property public stopDelayBetweenReels = 0.6;
    @property public autoStopDelay = 0.8;
    @property public stopImmediatelyDelayBetweenReels = 0.2;

    // 核心狀態
    private isSpinning = false;
    private isProcessingResults = false;
    private immediateStopRequested = false;
    private canStop = false;
    private customResult: SymbolType[] | null = null;
    private finalSymbols: SymbolType[] | null = null;
    private spinTimeouts: number[] = [];
    private lastWins: WinLine[] = [];
    private singleLineInterval: number | null = null;

    start() {
        this.bindEvents();
        this.updateSpinInteractable();
        this.updateCellsDisplay(this.generateRandomSymbols());
    }

    private bindEvents() {
        if (this.spinButton) {
            this.spinButton.node.setSiblingIndex(-1);
            this.spinButton.node.on('click', this.onSpinPressed, this);
        }
        if (this.confirmButton) {
            this.confirmButton.node.on('click', this.onConfirmPressed, this);
        }
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
            this.immediateStopRequested = true;
            this.stopAllReels(true).catch(console.error);
        } else if (!this.isSpinning) {
            this.startSpin();
        }
    }

    private async startSpin() {
        // console.log('[GameManager] 開始 Spin 流程');
        this.resetGameState();
        this.startReelsSequentially();
        this.scheduleAutoStop();
    }

    private resetGameState() {
        this.stopSingleLinePresentation();
        this.clearAllTimeouts();
        this.clearUI();

        this.finalSymbols = (this.customResult?.length === 9) 
            ? [...this.customResult] 
            : this.generateRandomSymbols();
        
        this.customResult = null;
        this.isSpinning = true;
        this.canStop = false;
        this.immediateStopRequested = false;
        this.isProcessingResults = false;
        this.updateSpinInteractable();
    }

    private clearUI() {
        if (this.ui) {
            this.ui.clearLines();
            this.ui.updateScore(0);
            this.ui.showMessage('');
        }
    }

    private startReelsSequentially() {
        this.reels.forEach((reel, i) => {
            const timeoutId = setTimeout(() => {
                if (this.isSpinning && !this.immediateStopRequested && reel) {
                    reel.spin(3.0, this.getFinalReelSymbols(i)).catch(console.error);
                    
                    if (i === 2) { // 第三軸開始轉動
                        this.canStop = true;
                        this.updateSpinInteractable();
                        console.log('[GameManager] 第三軸開始轉動，現在可以按 STOP');
                    }
                }
            }, i * this.startDelayBetweenReels * 1000);

            this.spinTimeouts.push(timeoutId);
        });
    }

    private scheduleAutoStop() {
        const lastReelStartTime = (this.reels.length - 1) * this.startDelayBetweenReels * 1000;
        const autoStopTime = lastReelStartTime + (this.autoStopDelay * 1000);
        
        const autoStopTimeoutId = setTimeout(() => {
            if (this.isSpinning && !this.immediateStopRequested) {
                this.stopAllReels(false).catch(console.error);
            }
        }, autoStopTime);

        this.spinTimeouts.push(autoStopTimeoutId);
    }

    // 統一的停止方法（immediate: true=立即停止, false=漸進式停止）
    private async stopAllReels(immediate: boolean) {
        console.log(`[GameManager] ${immediate ? '立即' : '漸進式'}停止所有滾輪`);

        const delay = immediate ? this.stopImmediatelyDelayBetweenReels : this.stopDelayBetweenReels;
        const stopPromises = this.createStopPromises(delay);
        
        if (stopPromises.length > 0) {
            await Promise.all(stopPromises);
        }

        if (!immediate) {
            await this.sleep(100);
        }

        this.finalizeSpin();
    }

    private createStopPromises(delay: number): Promise<void>[] {
        return this.reels.map((reel, i) => {
            return new Promise<void>((resolve) => {
                const timeoutId = setTimeout(() => {
                    if (reel) {
                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        if (reel.isSpinning()) {
                            reel.forceStop(finalReelSymbols, () => resolve());
                        } else {
                            reel.setFinalResult(finalReelSymbols, () => resolve());
                        }
                    } else {
                        resolve();
                    }
                }, i * delay * 1000);

                this.spinTimeouts.push(timeoutId);
            });
        });
    }

    private async finalizeSpin() {
        console.log('[GameManager] 完成 Spin，準備處理結果');

        this.isSpinning = false;
        this.canStop = false;

        if (this.finalSymbols) {
            this.updateCellsDisplay(this.finalSymbols);
        }

        await this.processResultsAndPresentation();
        this.updateSpinInteractable();
    }

    private async processResultsAndPresentation() {
        if (!this.finalSymbols) return;

        this.isProcessingResults = true;
        this.updateSpinInteractable();

        const wins: WinLine[] = PaylineChecker.check(this.finalSymbols);
        const totalScore = wins.reduce((sum, w) => sum + w.score, 0);
        
        this.lastWins = [...wins];
        this.ui?.updateScore(totalScore);

        if (wins.length === 0) {
            this.isProcessingResults = false;
            this.updateSpinInteractable();
            return;
        }

        await this.presentWins(wins);

        this.isProcessingResults = false;
        this.updateSpinInteractable();
        this.startSingleLinePresentation();
    }

    private async presentWins(wins: WinLine[]) {
        if (!this.ui) return;

        // 全線展演
        this.ui.clearLines();
        wins.forEach(w => this.ui!.showLine(w.lineIndex));

        const flashPromises = wins.map(w => {
            try {
                return this.ui!.flashLineTwice(w.lineIndex);
            } catch (e) {
                console.warn('[GameManager] flashLineTwice error:', e);
                return Promise.resolve();
            }
        }).filter(Boolean);

        await Promise.race([Promise.all(flashPromises), this.sleep(1500)]);

        // 單線輪播展演（多條線時）
        if (wins.length > 1) {
            for (const win of wins) {
                this.ui.clearLines();
                this.ui.showLine(win.lineIndex);
                await this.sleep(1000);
            }

            // 最後再次顯示所有線條
            this.ui.clearLines();
            wins.forEach(w => this.ui!.showLine(w.lineIndex));
        }
    }

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
        this.singleLineInterval = setInterval(showNextLine, 1500);
    }

    private stopSingleLinePresentation() {
        if (this.singleLineInterval) {
            clearInterval(this.singleLineInterval);
            this.singleLineInterval = null;
        }
    }

    private getFinalReelSymbols(reelIndex: number): SymbolType[] {
        if (!this.finalSymbols) {
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

    private clearAllTimeouts() {
        this.spinTimeouts.forEach(id => clearTimeout(id));
        this.spinTimeouts = [];
    }

    private updateCellsDisplay(symbols: SymbolType[]) {
        if (!symbols || symbols.length < 9) return;

        symbols.slice(0, 9).forEach((symbol, i) => {
            if (i < this.cells.length) {
                const symbolIndex = SymbolNames.indexOf(symbol);
                if (symbolIndex >= 0 && this.spriteFrames?.[symbolIndex]) {
                    try {
                        this.cells[i].spriteFrame = this.spriteFrames[symbolIndex];
                    } catch (e) {
                        console.warn(`[GameManager] failed to set spriteFrame for cell ${i}`, e);
                    }
                }
            }
        });
    }

    private parseEditBox(): SymbolType[] | null {
        if (!this.editBox?.string?.trim()) return null;

        const parts = this.editBox.string.trim()
            .split(/[,|\s]+/)
            .map(s => s.trim())
            .filter(Boolean);

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

    private generateRandomSymbols(): SymbolType[] {
        return Array.from({length: 9}, () => 
            SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
        );
    }

    private updateSpinInteractable() {
        if (this.spinButton) {
            this.spinButton.interactable = !this.isProcessingResults;
        }

        if (this.spinButtonLabel) {
            if (this.isProcessingResults) {
                this.spinButtonLabel.string = "SPIN";
            } else if (this.isSpinning && this.canStop) {
                this.spinButtonLabel.string = "STOP";
            } else if (this.isSpinning && !this.canStop) {
                this.spinButtonLabel.string = "Waiting";
            } else {
                this.spinButtonLabel.string = "SPIN";
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

    private sleep(ms: number): Promise<void> {
        return new Promise<void>(res => setTimeout(res, ms));
    }

    onDestroy() {
        this.clearAllTimeouts();
        this.stopSingleLinePresentation();
    }
}
