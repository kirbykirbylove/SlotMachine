// Reel.ts
import { _decorator, Component, Sprite, SpriteFrame, tween, Vec3, Node } from 'cc';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

@ccclass('Reel')
export class Reel extends Component {
    @property([Sprite])
    public cellSprites: Sprite[] = [];
    @property(Node)
    public reelContent: Node = null!;
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
        if (this.cellSprites.length !== 3 || !this.reelContent) {
            // console.error(`[Reel ${this.node.name}] 綁定檢查失敗`);
            return;
        }

        this.initializeReel();
    }

    private initializeReel() {
        this.generateSymbolSequence();
        this.setupReelContent();
        this.updateCellDisplay();
    }

    private generateSymbolSequence() {
        this.symbolSequence = Array.from({length: 20}, () => 
            SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
        );
    }

    private setupReelContent() {
        this.reelContent.removeAllChildren();
        this.contentSprites = [];
        this.contentSymbols = [];

        const totalCount = this.visibleSymbolCount + this.bufferSymbolCount * 2;

        for (let i = 0; i < totalCount; i++) {
            const symbolNode = new Node(`Symbol_${i}`);
            const sprite = symbolNode.addComponent(Sprite);
            const symbol = this.symbolSequence[i % this.symbolSequence.length];

            this.contentSymbols.push(symbol);
            this.contentSprites.push(sprite);
            
            this.updateSpriteFrame(sprite, symbol);
            symbolNode.setPosition(0, (totalCount - 1 - i) * this.symbolHeight, 0);
            this.reelContent.addChild(symbolNode);
        }

        this.reelContent.setPosition(0, -this.bufferSymbolCount * this.symbolHeight, 0);
        this.updateCurrentSymbols();
    }

    public spin(finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
        console.log(`[Reel ${this.node.name}] 開始滾動`);

        // 每次 SPIN 都重新生成序列
        this.generateSymbolSequence();

        this.spinning = true;
        this.stopFlag = false;
        this.finalSymbols = finalSymbols || null;

        return new Promise((resolve) => {
            this.spinPromiseResolve = resolve;
            this.startContinuousRoll();
        });
    }

    public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 1): SymbolType[] {
        // console.log(`[Reel ${this.node.name}] 強制停止，延遲 ${delay}s`);
        this.scheduleOnce(() => {
            this.executeStop(finalSymbols, onStopComplete);
        }, delay);

        return this.currentSymbols;
    }

    public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
        // console.log(`[Reel ${this.node.name}] 設定最終結果`);
        this.executeStop(finalSymbols, onComplete);
    }

    private executeStop(finalSymbols?: SymbolType[], onComplete?: () => void) {
        this.spinning = false;
        this.stopFlag = true;
        this.finalSymbols = finalSymbols || this.finalSymbols;

        this.stopRollingAnimation();

        if (this.finalSymbols) {
            this.applyFinalSymbols(this.finalSymbols);
        }

        this.alignToExactPosition();
        this.updateCellDisplay();
        this.completeStop(onComplete);
    }

    private completeStop(onComplete?: () => void) {
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

    private startContinuousRoll() {
        if (!this.reelContent || this.stopFlag) return;

        this.stopRollingAnimation();
        let sequenceIndex = 0;

        const rollStep = () => {
            if (this.stopFlag || !this.spinning) return;

            const currentY = this.reelContent.position.y;
            const newY = currentY - this.symbolHeight / 8;

            this.rollTween = tween(this.reelContent)
                .to(0.03, { position: new Vec3(0, newY, 0) }) //0.02
                .call(() => {
                    this.handleRollPosition(sequenceIndex++);
                    if (!this.stopFlag && this.spinning) {
                        rollStep();
                    }
                })
                .start();
        };

        rollStep();
    }

    private handleRollPosition(sequenceIndex: number) {
        if (!this.reelContent) return;

        const currentY = this.reelContent.position.y;
        const threshold = -this.symbolHeight * (this.bufferSymbolCount + 1);

        if (currentY <= threshold) {
            this.reelContent.setPosition(0, currentY + this.symbolHeight, 0);
            this.cycleSymbols(sequenceIndex);
        }
    }

    private cycleSymbols(sequenceIndex: number) {
        if (this.contentSymbols.length === 0) return;

        this.contentSymbols.shift();
        const newSymbol = this.symbolSequence[sequenceIndex % this.symbolSequence.length];
        this.contentSymbols.push(newSymbol);
        this.updateContentDisplay();
    }

    private applyFinalSymbols(symbols: SymbolType[]) {
        if (symbols.length !== 3) return;

        const startIndex = this.bufferSymbolCount;
        symbols.forEach((symbol, i) => {
            this.contentSymbols[startIndex + i] = symbol;
        });

        this.currentSymbols = [...symbols];
        this.updateContentDisplay();
    }

    private alignToExactPosition() {
        if (this.reelContent) {
            this.reelContent.setPosition(0, -this.bufferSymbolCount * this.symbolHeight, 0);
        }
    }

    private updateCurrentSymbols() {
        const startIndex = this.bufferSymbolCount;
        this.currentSymbols = this.contentSymbols.slice(startIndex, startIndex + 3);
    }

    private updateContentDisplay() {
        this.contentSymbols.forEach((symbol, i) => {
            if (i < this.contentSprites.length) {
                this.updateSpriteFrame(this.contentSprites[i], symbol);
            }
        });
        this.updateCurrentSymbols();
    }

    private updateCellDisplay() {
        this.currentSymbols.forEach((symbol, i) => {
            if (i < this.cellSprites.length) {
                this.updateSpriteFrame(this.cellSprites[i], symbol);
            }
        });
    }

    private updateSpriteFrame(sprite: Sprite, symbol: SymbolType) {
        if (!sprite || !symbol) return;
        
        const symbolIndex = SymbolNames.indexOf(symbol);
        if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
            sprite.spriteFrame = this.symbolFrames[symbolIndex];
        }
    }

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
        // console.log(`[Reel ${this.node.name}] 銷毀`);
        this.stopRollingAnimation();
        this.spinPromiseResolve = null;
    }
}

// // Reel.ts
// import { _decorator, Component, Sprite, SpriteFrame, tween, Vec3, Node } from 'cc';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// @ccclass('Reel')
// export class Reel extends Component {
//     @property([Sprite]) 
//     public cellSprites: Sprite[] = [];
//     @property(Node) 
//     public reelContent: Node = null!;
//     @property([SpriteFrame]) 
//     public symbolFrames: SpriteFrame[] = [];
//     @property 
//     public symbolHeight: number = 250;
//     @property 
//     public visibleSymbolCount: number = 3;
//     @property 
//     public bufferSymbolCount: number = 2;

//     // 核心狀態
//     private spinning = false;
//     private stopFlag = false;
//     private rollTween: any = null;
//     private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
//     private finalSymbols: SymbolType[] | null = null;
    
//     // 符號資料
//     private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
//     private contentSymbols: SymbolType[] = [];
//     private contentSprites: Sprite[] = [];
//     private symbolSequence: SymbolType[] = [];

//     start() {        
//         if (this.cellSprites.length !== 3 || !this.reelContent) {
//             console.error(`[Reel ${this.node.name}] 綁定檢查失敗`);
//             return;
//         }
//         this.initializeReel();
//     }

//     private initializeReel() {
//         this.generateSymbolSequence();
//         this.setupReelContent();
//         this.updateCellDisplay();
//     }

//     private generateSymbolSequence() {
//         this.symbolSequence = Array.from({length: 20}, () => 
//             SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//         );
//     }

//     private setupReelContent() {
//         this.reelContent.removeAllChildren();
//         this.contentSprites = [];
//         this.contentSymbols = [];

//         const totalCount = this.visibleSymbolCount + this.bufferSymbolCount * 2;

//         for (let i = 0; i < totalCount; i++) {
//             const symbolNode = new Node(`Symbol_${i}`);
//             const sprite = symbolNode.addComponent(Sprite);
//             const symbol = this.symbolSequence[i % this.symbolSequence.length];

//             this.contentSymbols.push(symbol);
//             this.contentSprites.push(sprite);
            
//             this.updateSpriteFrame(sprite, symbol);
//             symbolNode.setPosition(0, (totalCount - 1 - i) * this.symbolHeight, 0);
//             this.reelContent.addChild(symbolNode);
//         }

//         this.reelContent.setPosition(0, -this.bufferSymbolCount * this.symbolHeight, 0);
//         this.updateCurrentSymbols();
//     }

//     public spin(spinDuration = 1, finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
//         // console.log(`[Reel ${this.node.name}] 開始滾動`);

//         this.spinning = true;
//         this.stopFlag = false;
//         this.finalSymbols = finalSymbols || null;

//         return new Promise((resolve) => {
//             this.spinPromiseResolve = resolve;
//             this.startContinuousRoll();
//         });
//     }

//     public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 0.5): SymbolType[] {
//         // console.log(`[Reel ${this.node.name}] 強制停止，延遲 ${delay}s`);

//         this.scheduleOnce(() => {
//             this.executeStop(finalSymbols, onStopComplete);
//         }, delay);

//         return this.currentSymbols;
//     }

//     public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
//         // console.log(`[Reel ${this.node.name}] 設定最終結果`);
//         this.executeStop(finalSymbols, onComplete);
//     }

//     private executeStop(finalSymbols?: SymbolType[], onComplete?: () => void) {
//         this.spinning = false;
//         this.stopFlag = true;
//         this.finalSymbols = finalSymbols || this.finalSymbols;

//         this.stopRollingAnimation();

//         if (this.finalSymbols) {
//             this.applyFinalSymbols(this.finalSymbols);
//         }

//         this.alignToExactPosition();
//         this.updateCellDisplay();
//         this.completeStop(onComplete);
//     }

//     private completeStop(onComplete?: () => void) {
//         if (onComplete) {
//             try { onComplete(); } catch (e) { console.warn(e); }
//         }

//         if (this.spinPromiseResolve) {
//             try { 
//                 this.spinPromiseResolve([...this.currentSymbols]); 
//             } catch (e) { console.warn(e); }
//             this.spinPromiseResolve = null;
//         }
//     }

//     private startContinuousRoll() {
//         if (!this.reelContent || this.stopFlag) return;

//         this.stopRollingAnimation();
//         let sequenceIndex = 0;

//         const rollStep = () => {
//             if (this.stopFlag || !this.spinning) return;

//             const currentY = this.reelContent.position.y;
//             const newY = currentY - this.symbolHeight / 8;

//             this.rollTween = tween(this.reelContent)
//                 .to(0.03, { position: new Vec3(0, newY, 0) }) // 0.02
//                 .call(() => {
//                     this.handleRollPosition(sequenceIndex++);
//                     if (!this.stopFlag && this.spinning) {
//                         rollStep();
//                     }
//                 })
//                 .start();
//         };

//         rollStep();
//     }

//     private handleRollPosition(sequenceIndex: number) {
//         if (!this.reelContent) return;

//         const currentY = this.reelContent.position.y;
//         const threshold = -this.symbolHeight * (this.bufferSymbolCount + 1);

//         if (currentY <= threshold) {
//             this.reelContent.setPosition(0, currentY + this.symbolHeight, 0);
//             this.cycleSymbols(sequenceIndex);
//         }
//     }

//     private cycleSymbols(sequenceIndex: number) {
//         if (this.contentSymbols.length === 0) return;

//         this.contentSymbols.shift();
//         const newSymbol = this.symbolSequence[sequenceIndex % this.symbolSequence.length];
//         this.contentSymbols.push(newSymbol);
//         this.updateContentDisplay();
//     }

//     private applyFinalSymbols(symbols: SymbolType[]) {
//         if (symbols.length !== 3) return;

//         // 增加符號驗證，驗證每個符號是否有效
//         for (const symbol of symbols) {
//             if (!SymbolNames.includes(symbol)) {
//                 console.warn(`Invalid symbol: ${symbol}`);
//                 return;
//             }
//         }

//         const startIndex = this.bufferSymbolCount;
//         symbols.forEach((symbol, i) => {
//             this.contentSymbols[startIndex + i] = symbol;
//         });

//         this.currentSymbols = [...symbols];
//         this.updateContentDisplay();
//     }

//     private alignToExactPosition() {
//         if (this.reelContent) {
//             this.reelContent.setPosition(0, -this.bufferSymbolCount * this.symbolHeight, 0);
//         }
//     }

//     private updateCurrentSymbols() {
//         const startIndex = this.bufferSymbolCount;
//         this.currentSymbols = this.contentSymbols.slice(startIndex, startIndex + 3);
//     }

//     private updateContentDisplay() {
//         this.contentSymbols.forEach((symbol, i) => {
//             if (i < this.contentSprites.length) {
//                 this.updateSpriteFrame(this.contentSprites[i], symbol);
//             }
//         });
//         this.updateCurrentSymbols();
//     }

//     private updateCellDisplay() {
//         this.currentSymbols.forEach((symbol, i) => {
//             if (i < this.cellSprites.length) {
//                 this.updateSpriteFrame(this.cellSprites[i], symbol);
//             }
//         });
//     }

//     private updateSpriteFrame(sprite: Sprite, symbol: SymbolType) {
//         if (!sprite || !symbol) return;
        
//         const symbolIndex = SymbolNames.indexOf(symbol);
//         if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
//             sprite.spriteFrame = this.symbolFrames[symbolIndex];
//         }
//     }

//     private stopRollingAnimation() {
//         if (this.rollTween) {
//             try { this.rollTween.stop(); } catch (e) { /* ignore */ }
//             this.rollTween = null;
//         }
//     }

//     // 公共介面
//     public getCurrentSymbols(): SymbolType[] {
//         return [...this.currentSymbols];
//     }

//     public isSpinning(): boolean {
//         return this.spinning;
//     }

//     onDestroy() {
//         // console.log(`[Reel ${this.node.name}] 銷毀`);
//         this.stopRollingAnimation();
//         this.spinPromiseResolve = null;
//     }
// }
