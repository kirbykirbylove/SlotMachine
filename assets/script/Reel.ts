// Reel.ts - V1簡化版（移除冗餘程式碼，保持所有功能）
import { _decorator, Component, Sprite, SpriteFrame, tween, Vec3, Node } from 'cc';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

@ccclass('Reel')
export class Reel extends Component {
    @property([Sprite])
    public cellSprites: Sprite[] = []; // 3個可見格子

    @property(Node)
    public reelContent: Node = null!; // 滾動容器

    @property([SpriteFrame])
    public symbolFrames: SpriteFrame[] = [];

    @property
    public symbolHeight: number = 250;

    @property
    public visibleSymbolCount: number = 3;

    @property
    public bufferSymbolCount: number = 2;

    // 核心狀態
    private spinning = false;
    private stopFlag = false;
    private rollTween: any = null;
    private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
    private finalSymbols: SymbolType[] | null = null;
    
    // 符號資料
    private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
    private contentSymbols: SymbolType[] = [];
    private contentSprites: Sprite[] = [];
    private symbolSequence: SymbolType[] = [];

    start() {
        console.log(`[Reel ${this.node.name}] 初始化開始`);
        
        if (this.cellSprites.length !== 3 || !this.reelContent) {
            console.error(`[Reel ${this.node.name}] 綁定檢查失敗`);
            return;
        }

        this.generateSymbolSequence();
        this.initializeReelContent();
        this.updateCellDisplay();
        
        console.log(`[Reel ${this.node.name}] 初始化完成`);
    }

    // 產生符號序列
    private generateSymbolSequence() {
        this.symbolSequence = []; 
        for (let i = 0; i < 50; i++) {
            this.symbolSequence.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
        }
    }

    // 初始化滾動容器
    private initializeReelContent() {
        this.reelContent.removeAllChildren();
        this.contentSprites = [];
        this.contentSymbols = [];

        const totalCount = this.visibleSymbolCount + this.bufferSymbolCount * 2;

        // 建立符號節點
        for (let i = 0; i < totalCount; i++) {
            const symbolNode = new Node(`Symbol_${i}`);
            const sprite = symbolNode.addComponent(Sprite);
            const symbol = this.symbolSequence[i % this.symbolSequence.length];

            this.contentSymbols.push(symbol);
            this.contentSprites.push(sprite);
            
            // 設定圖片和位置
            this.updateSpriteFrame(sprite, symbol);
            symbolNode.setPosition(0, (totalCount - 1 - i) * this.symbolHeight, 0);
            this.reelContent.addChild(symbolNode);
        }

        // 設定初始位置
        this.reelContent.setPosition(0, -this.bufferSymbolCount * this.symbolHeight, 0);
        this.updateCurrentSymbols();
    }

    // 開始滾動
    public spin(spinDuration = 1, finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
        console.log(`[Reel ${this.node.name}] 開始滾動`);

        this.spinning = true;
        this.stopFlag = false;
        this.finalSymbols = finalSymbols || null;

        return new Promise((resolve) => {
            this.spinPromiseResolve = resolve;
            this.startContinuousRoll();
        });
    }

    // // 強制停止
    // public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void): SymbolType[] {
    //     console.log(`[Reel ${this.node.name}] 強制停止`);
    //     this.stopReel(finalSymbols, onStopComplete);
    //     return this.currentSymbols;
    // }

    public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 1): SymbolType[] {
    console.log(`[Reel ${this.node.name}] 強制停止，延遲 ${delay}s`);

    // 先確保不會馬上停，等 delay 之後才真正呼叫 stopReel
    this.scheduleOnce(() => {
        this.stopReel(finalSymbols, onStopComplete);
    }, delay);

    return this.currentSymbols;
}

    // 設定最終結果（未開始滾動時使用）
    public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
        console.log(`[Reel ${this.node.name}] 設定最終結果`);
        this.stopReel(finalSymbols, onComplete);
    }

    // 統一的停止處理
    private stopReel(finalSymbols?: SymbolType[], onComplete?: () => void) {
        this.spinning = false;
        this.stopFlag = true;
        this.finalSymbols = finalSymbols || this.finalSymbols;

        this.stopRollingAnimation();

        if (this.finalSymbols) {
            this.setFinalSymbols(this.finalSymbols);
        }

        this.alignToExactPosition();
        this.updateCellDisplay();

        // 執行回呼函式
        if (onComplete) {
            try { onComplete(); } catch (e) { console.warn(e); }
        }

        if (this.spinPromiseResolve) {
            try { 
                this.spinPromiseResolve([...this.currentSymbols]); 
            } catch (e) { console.warn(e); }
            this.spinPromiseResolve = null;
        }
    }

    // 連續滾動
    private startContinuousRoll() {
        if (!this.reelContent || this.stopFlag) return;

        this.stopRollingAnimation();

        let sequenceIndex = 0;

        const step = () => {
            if (this.stopFlag || !this.spinning) return;

            const currentY = this.reelContent.position.y;
            const newY = currentY - this.symbolHeight / 8;

            this.rollTween = tween(this.reelContent)
                .to(0.02, { position: new Vec3(0, newY, 0) })
                .call(() => {
                    this.checkAndLoopPosition(sequenceIndex++);
                    if (!this.stopFlag && this.spinning) {
                        step();
                    }
                })
                .start();
        };

        step();
    }

    // 檢查循環位置
    private checkAndLoopPosition(sequenceIndex: number) {
        if (!this.reelContent) return;

        const currentY = this.reelContent.position.y;
        const threshold = -this.symbolHeight * (this.bufferSymbolCount + 1);

        if (currentY <= threshold) {
            const resetY = currentY + this.symbolHeight;
            this.reelContent.setPosition(0, resetY, 0);
            this.cycleSymbols(sequenceIndex);
        }
    }

    // 循環符號
    private cycleSymbols(sequenceIndex: number) {
        if (this.contentSymbols.length === 0) return;

        this.contentSymbols.shift();
        const newSymbol = this.symbolSequence[sequenceIndex % this.symbolSequence.length];
        this.contentSymbols.push(newSymbol);
        this.updateContentDisplay();
    }

    // 設定最終符號到可見區域
    private setFinalSymbols(symbols: SymbolType[]) {
        if (symbols.length !== 3) return;

        const startIndex = this.bufferSymbolCount;
        for (let i = 0; i < 3; i++) {
            this.contentSymbols[startIndex + i] = symbols[i];
        }

        this.currentSymbols = [...symbols];
        this.updateContentDisplay();
    }

    // 對齊到準確位置
    private alignToExactPosition() {
        if (this.reelContent) {
            this.reelContent.setPosition(0, -this.bufferSymbolCount * this.symbolHeight, 0);
        }
    }

    // 更新目前可見符號
    private updateCurrentSymbols() {
        const startIndex = this.bufferSymbolCount;
        this.currentSymbols = [
            this.contentSymbols[startIndex],
            this.contentSymbols[startIndex + 1],
            this.contentSymbols[startIndex + 2]
        ];
    }

    // 更新滾動內容顯示
    private updateContentDisplay() {
        for (let i = 0; i < this.contentSymbols.length && i < this.contentSprites.length; i++) {
            this.updateSpriteFrame(this.contentSprites[i], this.contentSymbols[i]);
        }
        this.updateCurrentSymbols();
    }

    // 更新Cell顯示
    private updateCellDisplay() {
        for (let i = 0; i < Math.min(3, this.cellSprites.length, this.currentSymbols.length); i++) {
            this.updateSpriteFrame(this.cellSprites[i], this.currentSymbols[i]);
        }
    }

    // 統一的圖片更新方法
    private updateSpriteFrame(sprite: Sprite, symbol: SymbolType) {
        if (!sprite || !symbol) return;
        
        const symbolIndex = SymbolNames.indexOf(symbol);
        if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
            sprite.spriteFrame = this.symbolFrames[symbolIndex];
        }
    }

    // 停止滾動動畫
    private stopRollingAnimation() {
        if (this.rollTween) {
            try { this.rollTween.stop(); } catch (e) { /* ignore */ }
            this.rollTween = null;
        }
    }

    // 公共介面
    public getCurrentSymbols(): SymbolType[] {
        return [...this.currentSymbols];
    }

    public isSpinning(): boolean {
        return this.spinning;
    }

    onDestroy() {
        console.log(`[Reel ${this.node.name}] 銷毀`);
        this.stopRollingAnimation();
        this.spinPromiseResolve = null;
    }
}

