// GameManager.ts - 修正版（符合需求：無彈跳效果、即按 STOP 立即生效、只有三軸全部完成才呈現連線結果）
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
    public cells: Sprite[] = []; // 用於連線檢查的顯示（全局 3x3）

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
    public stopDelayBetweenReels = 0.4; // 每軸停止的延遲（秒），自動停用

    @property
    public reelSpinDuration = 3.0; // Reel 滾動持續時間（目前 Reel 內部自己控制）

    @property
    public autoStopDelay = 2.0; // 自動停止延遲（若玩家不按 STOP）

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
            this.spinButton.node.setSiblingIndex(-1); // 第一層
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
        // 如果正在處理結果（展演中），不回應
        if (this.isProcessingResults) {
            return;
        }

        // 如果正在滾動 -> 當作 STOP（即停）
        if (this.isSpinning) {
            // 設定立即停止旗標並立刻執行立即停止流程
            this.immediateStopRequested = true;
            this._stopAllReelsImmediately().catch(console.error);
            return;
        }

        // 否則開始新的 Spin
        this.startSpin();
    }

    private async startSpin() {
        console.log('[GameManager] 開始 Spin 流程');

        // 清除所有之前的定時器
        this.clearAllTimeouts();

        // 清除前一局畫面與分數（UI 的連線標示不會在滾輪停止前顯示）
        if (this.ui) {
            this.ui.clearLines();
            this.ui.updateScore(0);
            this.ui.showMessage('');
        }

        // 準備最終結果（9 格）
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

        // 依序啟動滾輪（若玩家在任何時間按 STOP，會立刻清掉這些 timeout，因此不會再啟動未開始的 reel）
        for (let i = 0; i < this.reels.length; i++) {
            const idx = i;
            const timeoutId = setTimeout(() => {
                // 如果已要求立即停止，則不啟動該 reel 的 spin（_stopAllReelsImmediately 會把最終結果設回給未啟動的 reel）
                if (this.isSpinning && !this.immediateStopRequested) {
                    const reel = this.reels[idx];
                    if (reel) {
                        const finalReelSymbols = this.getFinalReelSymbols(idx);
                        // 呼叫 spin，Reel 會持續滾動直到被 stop/forceStop
                        reel.spin(this.reelSpinDuration, finalReelSymbols).catch(console.error);
                    }
                }
            }, i * this.startDelayBetweenReels * 1000);

            this.spinTimeouts.push(timeoutId);
        }

        // 設置自動停止時間（玩家若不按 STOP，會自動漸停所有滾輪）
        const autoStopTime = ((this.reels.length - 1) * this.startDelayBetweenReels + this.autoStopDelay) * 1000;
        const autoStopTimeoutId = setTimeout(() => {
            if (this.isSpinning && !this.immediateStopRequested) {
                this._stopAllReelsGradually().catch(console.error);
            }
        }, autoStopTime);

        this.spinTimeouts.push(autoStopTimeoutId);
    }

    // 立即停止所有滾輪（按 STOP 按鈕），確保所有滾輪都設為最終結果後才顯示連線
    private async _stopAllReelsImmediately() {
        console.log('[GameManager] 立即停止所有滾輪');

        // 先清除還沒執行的所有 timeout（防止之後的 start 或 auto-stop 再觸發）
        this.clearAllTimeouts();

        // 建立等待所有 reel 完成的 promises
        const stopPromises: Promise<void>[] = [];

        for (let i = 0; i < this.reels.length; i++) {
            const reel = this.reels[i];
            if (!reel) continue;

            const finalReelSymbols = this.getFinalReelSymbols(i);

            // 如果 reel 還沒開始 spin（isSpinning() === false），直接把最終結果寫上並 resolve
            // 如果 reel 正在 spin，呼叫 forceStop，並等待完成
            const p = new Promise<void>((resolve) => {
                try {
                    if (reel.isSpinning()) {
                        // forceStop 會在完成後呼叫 callback resolve
                        reel.forceStop(finalReelSymbols, () => {
                            resolve();
                        });
                    } else {
                        // 未開始滾動或已停止：直接設置最終結果並立即 resolve
                        reel.setFinalResult(finalReelSymbols, () => {
                            resolve();
                        });
                    }
                } catch (e) {
                    console.warn('[GameManager] stop reel error:', e);
                    resolve();
                }
            });

            stopPromises.push(p);
        }

        // 等待所有 reels 都處理完畢（包含尚未啟動的 reel）
        if (stopPromises.length > 0) {
            await Promise.all(stopPromises);
        }

        // 所有 reel 確認為最終狀態後，執行後續處理（更新全局 cell、計算連線並展演）
        this.finalizeSpin();
    }

    // 漸進式停止滾輪（自動停止），保留由左到右依序停的自然感
    private async _stopAllReelsGradually() {
        console.log('[GameManager] 漸進式停止滾輪');

        // 依序停止滾輪，等待每軸完成後再停止下一軸
        const stopPromises: Promise<void>[] = [];

        for (let i = 0; i < this.reels.length; i++) {
            const idx = i;
            const p = new Promise<void>((resolve) => {
                const timeoutId = setTimeout(() => {
                    const reel = this.reels[idx];
                    if (reel && reel.isSpinning()) {
                        const finalReelSymbols = this.getFinalReelSymbols(idx);
                        reel.forceStop(finalReelSymbols, () => {
                            resolve();
                        });
                    } else {
                        // 若已停止或還沒開始，直接 resolve
                        // 若還沒開始但 auto-stop 到這一步，則設置最終結果，確保一致性
                        if (reel && !reel.isSpinning()) {
                            const finalReelSymbols = this.getFinalReelSymbols(idx);
                            reel.setFinalResult(finalReelSymbols, () => {
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    }
                }, i * this.stopDelayBetweenReels * 1000);

                this.spinTimeouts.push(timeoutId);
            });

            stopPromises.push(p);
        }

        // 等待所有滾輪停下
        await Promise.all(stopPromises);

        // 稍微等待確保畫面穩定（非常短）
        await this.sleep(120);

        this.finalizeSpin();
    }

    // 完成 Spin 並處理結果（此處確保所有滾輪已經被設定為最終符號）
    private async finalizeSpin() {
        console.log('[GameManager] 完成 Spin，準備處理結果');

        // 標記非滾動狀態（但進入結果處理程序）
        this.isSpinning = false;

        // 更新 cells 顯示（一次性，確保全局 3x3 與 finalSymbols 一致）
        if (this.finalSymbols) {
            this.updateCellsDisplay(this.finalSymbols);
        }

        // 處理結果展演（會將 isProcessingResults 設為 true，並在展演完成後還原）
        await this._processResultsAndPresentation();

        // 展演完成後才更新按鈕狀態
        this.updateSpinInteractable();
    }

    // 獲取指定滾輪的最終符號（從 finalSymbols 中抽取該列的三個符號）
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

    // 將 9 個符號更新到全局 cells 顯示（只在所有 reel 最終結果確定後呼叫）
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

    // 處理結果與展演（確保只有在 finalizeSpin 後才會執行）
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
            // 沒有中獎，結束
            this.isProcessingResults = false;
            this.updateSpinInteractable();
            return;
        }

        // 展演：先全部標示一次，再輪播（如果多條）
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

        // 若有多條，中間輪播顯示
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

    // 按鈕狀態：重要改動 -> 當 isSpinning 時，spinButton 必須仍可交互（以便按 STOP）
    private updateSpinInteractable() {
        if (this.spinButton) {
            // 只要不是處理結果（展演）就可以按：若正在滾動，按鈕做為 STOP 使用
            this.spinButton.interactable = !this.isProcessingResults;
        }

        if (this.spinButtonLabel) {
            if (this.isProcessingResults) {
                this.spinButtonLabel.string = "SPIN";
            } else if (this.isSpinning) {
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
