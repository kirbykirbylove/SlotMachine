// Reel.ts - 改良版（移除彈跳效果、立即停止/設置最終結果能同步回報完成）
import { _decorator, Component, Sprite, SpriteFrame, tween, Vec3, Node } from 'cc';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

@ccclass('Reel')
export class Reel extends Component {
    // 可見的3個Cell（用於最終顯示和連線檢查）
    @property([Sprite])
    public cellSprites: Sprite[] = []; // 長度應為 3，對應上中下

    // 滾動容器（包含多個符號節點，用於滾動效果）
    @property(Node)
    public reelContent: Node = null!; // 滾動容器

    @property([SpriteFrame])
    public symbolFrames: SpriteFrame[] = [];

    // 滾動參數
    @property
    public symbolHeight: number = 150; // 每個符號的高度

    @property
    public visibleSymbolCount: number = 3; // 可見符號數量

    @property
    public bufferSymbolCount: number = 2; // 上下緩衝符號數量（確保循環滾動）

    // 滾動相關
    private spinning = false;
    private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
    private rollTween: any = null;
    private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C]; // 當前顯示的3個符號
    private contentSymbols: SymbolType[] = []; // 滾動容器中的所有符號
    private contentSprites: Sprite[] = []; // 滾動容器中的所有Sprite
    private totalSymbolCount: number = 0;
    private stopFlag: boolean = false;
    private finalSymbols: SymbolType[] | null = null;

    start() {
        console.log(`[Reel ${this.node.name}] 初始化開始`);

        // 檢查綁定
        this.checkBindings();

        // 初始化滾動容器
        this.initializeReelContent();

        // 初始化顯示
        this.updateCellDisplay();

        console.log(`[Reel ${this.node.name}] 初始化完成，當前符號:`, this.currentSymbols);
    }

    private checkBindings() {
        if (this.cellSprites.length !== 3) {
            console.error(`[Reel ${this.node.name}] cellSprites 必須有 3 個元素`);
            return;
        }

        if (!this.reelContent) {
            console.error(`[Reel ${this.node.name}] reelContent 未綁定`);
            return;
        }
    }

    // 初始化滾動容器
    private initializeReelContent() {
        if (!this.reelContent) return;

        this.totalSymbolCount = this.visibleSymbolCount + this.bufferSymbolCount * 2;

        // 清理現有內容
        this.reelContent.removeAllChildren();
        this.contentSprites = [];
        this.contentSymbols = [];

        // 創建符號節點
        for (let i = 0; i < this.totalSymbolCount; i++) {
            // 創建符號節點
            const symbolNode = new Node(`Symbol_${i}`);
            const sprite = symbolNode.addComponent(Sprite);

            // 隨機分配符號
            const randomSymbol = SymbolNames[Math.floor(Math.random() * SymbolNames.length)];
            this.contentSymbols.push(randomSymbol);

            // 設置圖片（若 symbolFrames 有對應圖）
            const symbolIndex = SymbolNames.indexOf(randomSymbol);
            if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
                sprite.spriteFrame = this.symbolFrames[symbolIndex];
            }

            // 設置位置（從上到下排列）
            symbolNode.setPosition(0, (this.totalSymbolCount - 1 - i) * this.symbolHeight, 0);

            this.reelContent.addChild(symbolNode);
            this.contentSprites.push(sprite);
        }

        // 設置初始位置，讓可見區域顯示中間的符號
        const initialY = -this.bufferSymbolCount * this.symbolHeight;
        this.reelContent.setPosition(0, initialY, 0);

        // 更新當前可見符號
        this.updateCurrentSymbols();
    }

    // 更新當前可見的符號
    private updateCurrentSymbols() {
        const startIndex = this.bufferSymbolCount;
        this.currentSymbols = [
            this.contentSymbols[startIndex],
            this.contentSymbols[startIndex + 1],
            this.contentSymbols[startIndex + 2]
        ];
    }

    // 開始滾動
    public spin(spinDuration = 1, finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
        console.log(`[Reel ${this.node.name}] 開始滾動，預期最終:`, finalSymbols);

        this.spinning = true;
        this.stopFlag = false;
        this.finalSymbols = finalSymbols || null;

        return new Promise((resolve) => {
            this.spinPromiseResolve = resolve;

            // 開始連續滾動（簡單連續 tween 版本）
            this.startContinuousRoll();
        });
    }

    // 強制停止滾動（立即停止到 finalSymbols），接受 callback 作為完成標記
    public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void): SymbolType[] {
        console.log(`[Reel ${this.node.name}] 強制停止（forceStop）`, finalSymbols);

        this.stopFlag = true;
        this.finalSymbols = finalSymbols || this.finalSymbols;

        // 停止持續滾動動畫
        this.stopRollingAnimation();

        // 直接把 finalSymbols 寫入可見區域並對齊位置
        if (this.finalSymbols) {
            this.setFinalSymbols(this.finalSymbols);
        }

        // 立刻對齊位置（不做額外動畫）
        this.alignToExactPosition();

        // 更新 cell 顯示（Reel 內部的三格）
        this.updateCellDisplay();

        // 呼叫完成回調
        if (onStopComplete) {
            try { onStopComplete(); } catch (e) { console.warn(e); }
        }

        // resolve spin 的 promise（若有）
        if (this.spinPromiseResolve) {
            try {
                this.spinPromiseResolve([...this.currentSymbols]);
            } catch (e) { console.warn(e); }
            this.spinPromiseResolve = null;
        }

        // 返回當前符號
        return this.currentSymbols;
    }

    // 開始連續滾動動畫（基於 tween 的簡化實現）
    private startContinuousRoll() {
        if (!this.reelContent || this.stopFlag) return;

        // 停止之前的動畫
        this.stopRollingAnimation();

        // 基本連續滾動：每次滾動一小段距離並循環 symbols
        const rollStepDistance = this.symbolHeight / 3;
        const rollStepDuration = 0.04; // 秒

        const step = () => {
            if (this.stopFlag || !this.spinning) return;

            const currentY = this.reelContent.position.y;
            const newY = currentY - rollStepDistance;

            this.rollTween = tween(this.reelContent)
                .to(rollStepDuration, { position: new Vec3(0, newY, 0) })
                .call(() => {
                    // 檢查是否需要循環
                    this.checkAndLoopSymbols();

                    // 隨機化非可見區域的符號以模擬快速變化
                    this.randomizeContentSymbols();

                    // 繼續下一步
                    if (!this.stopFlag && this.spinning) {
                        step();
                    } else {
                        // 若已停止，保證最終符號已經設置（forceStop / setFinalSymbols 會處理）
                    }
                })
                .start();
        };

        step();
    }

    // 檢查並循環符號位置
    private checkAndLoopSymbols() {
        if (!this.reelContent) return;

        const currentY = this.reelContent.position.y;
        const threshold = -this.symbolHeight * (this.bufferSymbolCount + 1);

        // 如果滾動超過閾值，重置位置並循環符號
        if (currentY <= threshold) {
            const resetY = currentY + this.symbolHeight;
            this.reelContent.setPosition(0, resetY, 0);

            // 循環符號：將最上面的符號移到最下面
            this.cycleSymbols();
        }
    }

    // 循環符號內容
    private cycleSymbols() {
        if (this.contentSymbols.length === 0) return;

        // 將第一個符號移到最後
        const firstSymbol = this.contentSymbols.shift();
        if (firstSymbol) {
            this.contentSymbols.push(firstSymbol);
        }

        // 更新顯示
        this.updateContentDisplay();
    }

    // 隨機化滾動內容中的符號（模擬快速變化）
    private randomizeContentSymbols() {
        for (let i = 0; i < this.contentSymbols.length; i++) {
            // 只隨機化非可見區域的符號
            if (i < this.bufferSymbolCount || i >= this.bufferSymbolCount + this.visibleSymbolCount) {
                this.contentSymbols[i] = SymbolNames[Math.floor(Math.random() * SymbolNames.length)];
            }
        }
        this.updateContentDisplay();
    }

    // 停止滾動並設置最終結果（由未開始滾動的 reel 呼叫）
    private stopRolling(onStopComplete?: () => void) {
        console.log(`[Reel ${this.node.name}] stopRolling called, final:`, this.finalSymbols);

        this.spinning = false;
        this.stopFlag = true;
        this.stopRollingAnimation();

        if (this.finalSymbols) {
            this.setFinalSymbols(this.finalSymbols);
        }

        // 直接對齊位置並更新顯示（移除任何彈跳與減速動畫）
        this.alignToExactPosition();
        this.updateCellDisplay();

        if (onStopComplete) {
            onStopComplete();
        }

        if (this.spinPromiseResolve) {
            this.spinPromiseResolve([...this.currentSymbols]);
            this.spinPromiseResolve = null;
        }
    }

    // 設置最終符號並調整可見區域內容
    private setFinalSymbols(symbols: SymbolType[]) {
        if (symbols.length !== 3) return;

        const startIndex = this.bufferSymbolCount;
        for (let i = 0; i < 3; i++) {
            this.contentSymbols[startIndex + i] = symbols[i];
        }

        this.currentSymbols = [...symbols];
        this.updateContentDisplay();
    }

    // 對齊到準確位置（直接設定，不做動畫）
    private alignToExactPosition() {
        if (!this.reelContent) return;
        const targetY = -this.bufferSymbolCount * this.symbolHeight;
        this.reelContent.setPosition(0, targetY, 0);
    }

    // 更新滾動內容的顯示（同步 contentSymbols -> contentSprites）
    private updateContentDisplay() {
        for (let i = 0; i < this.contentSymbols.length && i < this.contentSprites.length; i++) {
            const symbol = this.contentSymbols[i];
            const sprite = this.contentSprites[i];

            if (sprite && symbol) {
                const symbolIndex = SymbolNames.indexOf(symbol);
                if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
                    sprite.spriteFrame = this.symbolFrames[symbolIndex];
                }
            }
        }

        // 更新當前可見符號
        this.updateCurrentSymbols();
    }

    // 更新 Cell 顯示（Reel 內部的三個 cellSprites）
    private updateCellDisplay() {
        for (let i = 0; i < Math.min(3, this.cellSprites.length, this.currentSymbols.length); i++) {
            const symbol = this.currentSymbols[i];
            const cell = this.cellSprites[i];

            if (cell && symbol) {
                const symbolIndex = SymbolNames.indexOf(symbol);
                if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
                    cell.spriteFrame = this.symbolFrames[symbolIndex];
                }
            }
        }
    }

    // 停止滾動動畫（停止 tween）
    private stopRollingAnimation() {
        if (this.rollTween) {
            try {
                this.rollTween.stop();
            } catch (e) { /* ignore */ }
            this.rollTween = null;
        }
    }

    // 設置最終結果（給還沒開始滾動的滾輪使用），並可選擇 onComplete callback
    public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
        console.log(`[Reel ${this.node.name}] setFinalResult:`, finalSymbols);

        this.spinning = false;
        this.stopFlag = true;
        this.finalSymbols = finalSymbols;

        // 停止任何動畫並直接設置結果
        this.stopRollingAnimation();

        if (this.finalSymbols) {
            this.setFinalSymbols(this.finalSymbols);
        }

        this.alignToExactPosition();
        this.updateCellDisplay();

        if (onComplete) {
            try { onComplete(); } catch (e) { console.warn(e); }
        }

        if (this.spinPromiseResolve) {
            try {
                this.spinPromiseResolve([...this.currentSymbols]);
            } catch (e) { /* ignore */ }
            this.spinPromiseResolve = null;
        }
    }

    // 獲取當前列的三個符號（複製返回）
    public getCurrentSymbols(): SymbolType[] {
        return [...this.currentSymbols];
    }

    // 檢查是否在滾動
    public isSpinning(): boolean {
        return this.spinning;
    }

    onDestroy() {
        console.log(`[Reel ${this.node.name}] 銷毀`);
        this.stopRollingAnimation();
        this.spinPromiseResolve = null;
    }
}
