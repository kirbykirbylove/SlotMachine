// Reel.ts
import { _decorator, Component, Node, Sprite, SpriteFrame, tween, Vec3 } from 'cc';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

enum ReelState {
    STOP,
    ROLLING,
    STOPPING
}

@ccclass('Reel')
export class Reel extends Component {
    @property([Sprite]) cellSprites: Sprite[] = [];
    @property(Node) reelContent: Node = null!;
    @property([SpriteFrame]) symbolFrames: SpriteFrame[] = [];
    @property symbolHeight: number = 100;
    @property speed: number = 1500;
    @property targetRollingTime: number = 3;

    // 內部狀態
    private state: ReelState = ReelState.STOP;
    private symbolNodes: Node[] = [];
    private symbolSprites: Sprite[] = [];
    private currentSymbols: SymbolType[] = [];
    private finalResult: SymbolType[] = [];
    private spinning: boolean = false;
    private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
    private resultPlanted: boolean = false;
    private symbolsPassedSincePlant: number = 0;
    private stopRequested: boolean = false;

    // 布局常量
    private readonly VISIBLE_COUNT = 3;
    private readonly BUFFER_COUNT = 2;
    private readonly TOTAL_NODES = 7;
    private readonly BOUNCE_HEIGHT = 40;
    private readonly START_BOUNCE_HEIGHT = 20;

    start() {
        if (this.cellSprites.length !== 3 || !this.reelContent) {
            console.error(`[Reel ${this.node.name}] 配置錯誤：需要3個cellSprites和reelContent`);
            return;
        }
        this.initializeReel();
    }

    private initializeReel() {
        this.currentSymbols = this.getRandomSymbols(3);
        this.setupReelNodes();
        this.updateCellDisplay();
        console.log(`[Reel ${this.node.name}] 初始化完成，符號: ${this.currentSymbols.join(', ')}`);
    }

    private setupReelNodes() {
        this.reelContent.removeAllChildren();
        this.symbolNodes = [];
        this.symbolSprites = [];

        const startY = (this.TOTAL_NODES - 1) * this.symbolHeight / 2;

        for (let i = 0; i < this.TOTAL_NODES; i++) {
            const { node, sprite } = this.createSymbolNode(i, startY);
            const symbol = this.getInitialSymbol(i);
            this.setSymbolFrame(sprite, symbol);
            
            this.reelContent.addChild(node);
            this.symbolNodes.push(node);
            this.symbolSprites.push(sprite);
        }

        this.reelContent.setPosition(0, 0, 0);
    }

    private createSymbolNode(index: number, startY: number): { node: Node, sprite: Sprite } {
        const node = new Node(`Symbol_${index}`);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.setContentSize(this.symbolHeight, this.symbolHeight);
        node.setPosition(0, startY - index * this.symbolHeight, 0);
        return { node, sprite };
    }

    private getInitialSymbol(nodeIndex: number): SymbolType {
        const isVisible = nodeIndex >= this.BUFFER_COUNT && nodeIndex < this.BUFFER_COUNT + 3;
        return isVisible 
            ? this.currentSymbols[nodeIndex - this.BUFFER_COUNT]
            : this.getRandomSymbol();
    }

    update(deltaTime: number) {
        if (this.state !== ReelState.ROLLING) return;

        // 移動符號
        this.moveSymbols(deltaTime);
        
        // 回收符號
        this.recycleSymbols();

        // 植入結果（如果需要）
        if (!this.resultPlanted && this.finalResult.length === 3 && this.stopRequested) {
            this.plantFinalResult();
        }

        // 檢查停止條件
        if (this.resultPlanted && this.symbolsPassedSincePlant >= 2) {
            console.log(`[Reel ${this.node.name}] 結果已滾動到位，準備停止`);
            this.state = ReelState.STOPPING;
            this.alignAndStop();
        }
    }

    private moveSymbols(deltaTime: number) {
        const moveDistance = this.speed * deltaTime;
        this.symbolNodes.forEach(node => {
            const pos = node.position;
            node.setPosition(pos.x, pos.y - moveDistance, pos.z);
        });
    }

    private recycleSymbols() {
        const bottomThreshold = -(this.TOTAL_NODES / 2 + 0.5) * this.symbolHeight;
        const maxY = Math.max(...this.symbolNodes.map(n => n.position.y));
        
        this.symbolNodes.forEach((node, i) => {
            if (node.position.y < bottomThreshold) {
                // 回收到頂部
                node.setPosition(0, maxY + this.symbolHeight, 0);
                
                // 計數
                if (this.resultPlanted) {
                    this.symbolsPassedSincePlant++;
                }
                
                // 換圖
                this.setSymbolFrame(this.symbolSprites[i], this.getRandomSymbol());
            }
        });
    }

    private plantFinalResult() {
        console.log(`[Reel ${this.node.name}] 🌱 植入最終結果: ${this.finalResult.join(', ')}`);
        
        const sortedNodes = this.getSortedNodes();
        
        // 植入到頂部緩衝區的3個nodes
        this.finalResult.forEach((symbol, i) => {
            const targetNode = sortedNodes[i];
            const spriteIndex = this.symbolNodes.indexOf(targetNode);
            if (spriteIndex >= 0) {
                this.setSymbolFrame(this.symbolSprites[spriteIndex], symbol);
                console.log(`[Reel ${this.node.name}]   植入 ${symbol} 到 node ${spriteIndex} (Y: ${targetNode.position.y.toFixed(0)})`);
            }
        });
        
        this.resultPlanted = true;
        this.symbolsPassedSincePlant = 0;
    }

    private alignAndStop() {
        console.log(`[Reel ${this.node.name}] 開始對齊停止`);
        
        // 停止並重排
        this.state = ReelState.STOP;
        this.spinning = false;
        this.realignNodes();
        
        // 讀取最終符號
        this.currentSymbols = this.readVisibleSymbols();
        
        console.log(`[Reel ${this.node.name}] ✅ 停止完成: ${this.currentSymbols.join(', ')}`);
        
        // 驗證結果
        this.verifyResult();
        
        // 播放停止動畫
        this.playBounceAnimation();
    }

    private realignNodes() {
        const sortedNodes = this.getSortedNodes();
        const startY = (this.TOTAL_NODES - 1) * this.symbolHeight / 2;
        
        sortedNodes.forEach((node, i) => {
            node.setPosition(0, startY - i * this.symbolHeight, 0);
        });
        
        this.reelContent.setPosition(0, 0, 0);
    }

    private readVisibleSymbols(): SymbolType[] {
        const sortedNodes = this.getSortedNodes();
        const symbols: SymbolType[] = [];
        
        for (let i = this.BUFFER_COUNT; i < this.BUFFER_COUNT + 3; i++) {
            const sprite = sortedNodes[i].getComponent(Sprite);
            if (sprite?.spriteFrame) {
                const symbolIndex = this.symbolFrames.indexOf(sprite.spriteFrame);
                if (symbolIndex >= 0) {
                    symbols.push(SymbolNames[symbolIndex]);
                }
            }
        }
        
        return symbols;
    }

    private verifyResult() {
        if (this.finalResult.length !== 3) return;
        
        const match = this.currentSymbols.every((s, i) => s === this.finalResult[i]);
        if (!match) {
            console.error(`[Reel ${this.node.name}] ❌ 結果不匹配！`);
            console.error(`  期望: ${this.finalResult.join(', ')}`);
            console.error(`  實際: ${this.currentSymbols.join(', ')}`);
        } else {
            console.log(`[Reel ${this.node.name}] ✅ 結果驗證通過`);
        }
    }

    private playBounceAnimation() {
        const originalPos = this.node.position.clone();
        
        tween(this.node)
            .to(0.12, { 
                position: new Vec3(originalPos.x, originalPos.y - this.BOUNCE_HEIGHT, originalPos.z) 
            }, { easing: 'quadOut' })
            .to(0.12, { position: originalPos }, { easing: 'bounceOut' })
            .call(() => {
                this.updateCellDisplay();
                this.finishSpin();
            })
            .start();
    }

    // === 公開方法 ===

    public spin(finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
        console.log(`[Reel ${this.node.name}] 🎬 開始SPIN，最終符號: ${finalSymbols?.join(', ') || '無'}`);
        
        this.resetSpinState();
        this.finalResult = finalSymbols?.length === 3 ? [...finalSymbols] : [];
        this.playStartBounce();

        return new Promise((resolve) => {
            this.spinPromiseResolve = resolve;
        });
    }

    private resetSpinState() {
        this.spinning = true;
        this.state = ReelState.ROLLING;
        this.resultPlanted = false;
        this.symbolsPassedSincePlant = 0;
        this.stopRequested = false;
    }

    private playStartBounce() {
        const originalPos = this.node.position.clone();

        tween(this.node)
            .to(0.15, { 
                position: new Vec3(originalPos.x, originalPos.y + this.START_BOUNCE_HEIGHT, originalPos.z) 
            }, { easing: 'quadOut' })
            .to(0.15, { position: originalPos }, { easing: 'quadIn' })
            .start();
    }

    public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 0.1): SymbolType[] {
        this.scheduleOnce(() => {
            console.log(`[Reel ${this.node.name}] 🛑 forceStop 被調用`);
            
            if (finalSymbols?.length === 3) {
                this.finalResult = [...finalSymbols];
            }
            
            this.stopRequested = true;
            
            if (onStopComplete) {
                this.wrapResolveWithCallback(onStopComplete);
            }
        }, delay);
        
        return this.currentSymbols;
    }

    private wrapResolveWithCallback(callback: () => void) {
        const originalResolve = this.spinPromiseResolve;
        this.spinPromiseResolve = (symbols) => {
            originalResolve?.(symbols);
            callback();
        };
    }

    public setFinalResult(finalSymbols?: SymbolType[], onComplete?: () => void): void {
        console.log(`[Reel ${this.node.name}] setFinalResult 被調用: ${finalSymbols?.join(', ')}`);
        
        if (finalSymbols?.length === 3) {
            this.currentSymbols = [...finalSymbols];
            this.updateVisibleNodes(finalSymbols);
            this.updateCellDisplay();
        }
        
        onComplete?.();
    }

    private updateVisibleNodes(symbols: SymbolType[]) {
        const sortedNodes = this.getSortedNodes();
        
        for (let i = 0; i < 3; i++) {
            const nodeIndex = this.BUFFER_COUNT + i;
            const targetNode = sortedNodes[nodeIndex];
            const spriteIndex = this.symbolNodes.indexOf(targetNode);
            if (spriteIndex >= 0) {
                this.setSymbolFrame(this.symbolSprites[spriteIndex], symbols[i]);
            }
        }
    }

    public getCurrentSymbols(): SymbolType[] {
        return [...this.currentSymbols];
    }

    public isSpinning(): boolean {
        return this.spinning;
    }

    // === 輔助方法 ===

    private finishSpin() {
        this.spinPromiseResolve?.(this.currentSymbols);
        this.spinPromiseResolve = null;
    }

    private updateCellDisplay() {
        this.currentSymbols.forEach((symbol, i) => {
            if (i < this.cellSprites.length) {
                this.setSymbolFrame(this.cellSprites[i], symbol);
            }
        });
    }

    private setSymbolFrame(sprite: Sprite, symbol: SymbolType) {
        if (!sprite || !symbol) return;
        
        const symbolIndex = SymbolNames.indexOf(symbol);
        if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
            sprite.spriteFrame = this.symbolFrames[symbolIndex];
        }
    }

    private getSortedNodes(): Node[] {
        return [...this.symbolNodes].sort((a, b) => b.position.y - a.position.y);
    }

    private getRandomSymbol(): SymbolType {
        return SymbolNames[Math.floor(Math.random() * SymbolNames.length)];
    }

    private getRandomSymbols(count: number): SymbolType[] {
        return Array.from({ length: count }, () => this.getRandomSymbol());
    }

    onDestroy() {
        this.spinPromiseResolve = null;
    }
}

// // Reel.ts
// import { _decorator, Component, Node, Sprite, SpriteFrame, tween, Vec3 } from 'cc';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// enum ReelState {
//     STOP,
//     ROLLING,
//     STOPPING
// }

// @ccclass('Reel')
// export class Reel extends Component {
//     @property([Sprite]) 
//     cellSprites: Sprite[] = [];
    
//     @property(Node) 
//     reelContent: Node = null!;
    
//     @property([SpriteFrame]) 
//     symbolFrames: SpriteFrame[] = [];
    
//     @property 
//     symbolHeight: number = 100;
    
//     @property 
//     speed: number = 1500;
    
//     @property 
//     targetRollingTime: number = 3;

//     // 內部狀態
//     private state: ReelState = ReelState.STOP;
//     private symbolNodes: Node[] = [];
//     private symbolSprites: Sprite[] = [];
//     private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
//     private finalResult: SymbolType[] = [];
//     private rollingTime: number = 0;
//     private spinning: boolean = false;
//     private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
//     private resultPlanted: boolean = false;
//     private symbolsPassedSincePlant: number = 0;
//     private stopRequested: boolean = false;

//     // 布局配置
//     private readonly visibleSymbolCount: number = 3;
//     private readonly bufferSymbolCount: number = 2;
//     private readonly totalNodes: number = 7;

//     start() {
//         if (this.cellSprites.length !== 3 || !this.reelContent) {
//             console.error(`[Reel ${this.node.name}] 配置錯誤：需要3個cellSprites和reelContent`);
//             return;
//         }
//         this.initializeReel();
//     }

//     private initializeReel() {
//         // 隨機初始符號
//         this.currentSymbols = Array.from({length: 3}, () => 
//             SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//         );
        
//         this.setupReelNodes();
//         this.updateCellDisplay();
        
//         console.log(`[Reel ${this.node.name}] 初始化完成，符號: ${this.currentSymbols.join(', ')}`);
//     }

//     private setupReelNodes() {
//         this.reelContent.removeAllChildren();
//         this.symbolNodes = [];
//         this.symbolSprites = [];

//         // 從上到下：[上緩衝2, 可見3, 下緩衝2]
//         const startY = (this.totalNodes - 1) * this.symbolHeight / 2;

//         for (let i = 0; i < this.totalNodes; i++) {
//             const symbolNode = new Node(`Symbol_${i}`);
//             const sprite = symbolNode.addComponent(Sprite);
//             sprite.sizeMode = Sprite.SizeMode.CUSTOM;
//             symbolNode.setContentSize(this.symbolHeight, this.symbolHeight);
            
//             const y = startY - i * this.symbolHeight;
//             symbolNode.setPosition(0, y, 0);
            
//             // 初始化：中間3個顯示currentSymbols，其他隨機
//             let symbolToSet: SymbolType;
//             if (i >= this.bufferSymbolCount && i < this.bufferSymbolCount + 3) {
//                 symbolToSet = this.currentSymbols[i - this.bufferSymbolCount];
//             } else {
//                 symbolToSet = SymbolNames[Math.floor(Math.random() * SymbolNames.length)];
//             }
//             this.updateSpriteFrame(sprite, symbolToSet);
            
//             this.reelContent.addChild(symbolNode);
//             this.symbolNodes.push(symbolNode);
//             this.symbolSprites.push(sprite);
//         }

//         this.reelContent.setPosition(0, 0, 0);
//     }

//     update(deltaTime: number) {
//         if (this.state === ReelState.STOP) return;

//         // === ROLLING 階段 ===
//         if (this.state === ReelState.ROLLING) {
//             this.rollingTime += deltaTime;

//             // 移動所有symbol
//             for (let i = 0; i < this.symbolNodes.length; i++) {
//                 const node = this.symbolNodes[i];
//                 const pos = node.position;
//                 node.setPosition(pos.x, pos.y - this.speed * deltaTime, pos.z);
//             }

//             // 回收機制
//             this.handleSymbolRecycling();

//             // 檢查是否該植入結果
//             if (!this.resultPlanted && this.finalResult.length === 3 && this.stopRequested) {
//                 this.plantFinalResult();
//             }

//             // 檢查是否該停止
//             if (this.resultPlanted && this.symbolsPassedSincePlant >= 2) {
//                 console.log(`[Reel ${this.node.name}] 結果已滾動到位，準備停止`);
//                 this.state = ReelState.STOPPING;
//                 this.alignAndStop();
//             }
//         }
//     }

//     private handleSymbolRecycling() {
//         const bottomThreshold = -(this.totalNodes / 2 + 0.5) * this.symbolHeight;
        
//         for (let i = 0; i < this.symbolNodes.length; i++) {
//             const node = this.symbolNodes[i];
//             const pos = node.position;
            
//             if (pos.y < bottomThreshold) {
//                 // 回收到頂部
//                 const maxY = Math.max(...this.symbolNodes.map(n => n.position.y));
//                 node.setPosition(pos.x, maxY + this.symbolHeight, pos.z);

//                 // 計數（用於停止判斷）
//                 if (this.resultPlanted) {
//                     this.symbolsPassedSincePlant++;
//                 }

//                 // 換圖邏輯
//                 if (this.resultPlanted) {
//                     // 已植入結果，繼續隨機
//                     const randomSymbol = SymbolNames[Math.floor(Math.random() * SymbolNames.length)];
//                     this.updateSpriteFrame(this.symbolSprites[i], randomSymbol);
//                 } else {
//                     // 未植入結果，隨機
//                     const randomSymbol = SymbolNames[Math.floor(Math.random() * SymbolNames.length)];
//                     this.updateSpriteFrame(this.symbolSprites[i], randomSymbol);
//                 }
//             }
//         }
//     }

//     /**
//      * 關鍵方法：植入最終結果到即將進入可見區的位置
//      */
//     private plantFinalResult() {
//         console.log(`[Reel ${this.node.name}] 🌱 植入最終結果: ${this.finalResult.join(', ')}`);
        
//         // 找到當前在頂部緩衝區的3個nodes（即將滾入可見區）
//         // 排序：從上到下
//         const sortedNodes = [...this.symbolNodes].sort((a, b) => b.position.y - a.position.y);
        
//         // 將最終結果植入到頂部緩衝區的nodes（索引0,1,2）
//         // 注意：finalResult[0]是頂部，finalResult[2]是底部
//         for (let i = 0; i < 3 && i < this.finalResult.length; i++) {
//             const targetNode = sortedNodes[i];
//             const spriteIndex = this.symbolNodes.indexOf(targetNode);
//             if (spriteIndex >= 0) {
//                 this.updateSpriteFrame(this.symbolSprites[spriteIndex], this.finalResult[i]);
//                 console.log(`[Reel ${this.node.name}]   植入 ${this.finalResult[i]} 到 node ${spriteIndex} (Y: ${targetNode.position.y.toFixed(0)})`);
//             }
//         }
        
//         this.resultPlanted = true;
//         this.symbolsPassedSincePlant = 0;
//     }

//     /**
//      * 精確對齊並停止
//      */
//     private alignAndStop() {
//         console.log(`[Reel ${this.node.name}] 開始對齊停止`);
        
//         // 立即停止滾動
//         this.state = ReelState.STOP;
//         this.spinning = false;
        
//         // 排序nodes（從上到下）
//         const sortedNodes = [...this.symbolNodes].sort((a, b) => b.position.y - a.position.y);
        
//         // 精確重排：確保中間3個在標準位置
//         const startY = (this.totalNodes - 1) * this.symbolHeight / 2;
//         for (let i = 0; i < sortedNodes.length; i++) {
//             const node = sortedNodes[i];
//             const targetY = startY - i * this.symbolHeight;
//             node.setPosition(0, targetY, 0);
//         }
        
//         // 重置容器
//         this.reelContent.setPosition(0, 0, 0);
        
//         // 讀取最終符號（從可見區域）
//         this.currentSymbols = [];
//         for (let i = this.bufferSymbolCount; i < this.bufferSymbolCount + 3; i++) {
//             const sprite = sortedNodes[i].getComponent(Sprite);
//             if (sprite && sprite.spriteFrame) {
//                 const symbolIndex = this.symbolFrames.indexOf(sprite.spriteFrame);
//                 if (symbolIndex >= 0) {
//                     this.currentSymbols.push(SymbolNames[symbolIndex]);
//                 }
//             }
//         }
        
//         console.log(`[Reel ${this.node.name}] ✅ 停止完成: ${this.currentSymbols.join(', ')}`);
        
//         // 驗證結果
//         if (this.finalResult.length === 3) {
//             const match = this.currentSymbols.every((s, i) => s === this.finalResult[i]);
//             if (!match) {
//                 console.error(`[Reel ${this.node.name}] ❌ 結果不匹配！`);
//                 console.error(`  期望: ${this.finalResult.join(', ')}`);
//                 console.error(`  實際: ${this.currentSymbols.join(', ')}`);
//             } else {
//                 console.log(`[Reel ${this.node.name}] ✅ 結果驗證通過`);
//             }
//         }
        
//         // 播放停止動畫
//         this.playBounceAnimation();
//     }

//     private playBounceAnimation() {
//         const originalPos = this.node.position.clone();
//         const bounceHeight = 40;
        
//         tween(this.node)
//             .to(0.12, { position: new Vec3(originalPos.x, originalPos.y - bounceHeight, originalPos.z) }, { easing: 'quadOut' })
//             .to(0.12, { position: originalPos }, { easing: 'bounceOut' })
//             .call(() => {
//                 this.updateCellDisplay();
//                 this.finishSpin();
//             })
//             .start();
//     }

//     // === 公開方法 ===

//     public spin(finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
//         console.log(`[Reel ${this.node.name}] 🎬 開始SPIN，最終符號: ${finalSymbols?.join(', ') || '無'}`);
        
//         this.spinning = true;
//         this.state = ReelState.ROLLING;
//         this.rollingTime = 0;
//         this.resultPlanted = false;
//         this.symbolsPassedSincePlant = 0;
//         this.stopRequested = false;
        
//         // 保存最終結果
//         if (finalSymbols && finalSymbols.length === 3) {
//             this.finalResult = [...finalSymbols];
//         } else {
//             this.finalResult = [];
//         }

//         // 啟動彈跳動畫
//         const originalPos = this.node.position.clone();
//         const bounceHeight = 20;

//         tween(this.node)
//             .to(0.15, { position: new Vec3(originalPos.x, originalPos.y + bounceHeight, originalPos.z) }, { easing: 'quadOut' })
//             .to(0.15, { position: originalPos }, { easing: 'quadIn' })
//             .start();

//         return new Promise((resolve) => {
//             this.spinPromiseResolve = resolve;
//         });
//     }

//     public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 0.1): SymbolType[] {
//         this.scheduleOnce(() => {
//             console.log(`[Reel ${this.node.name}] 🛑 forceStop 被調用`);
            
//             if (finalSymbols && finalSymbols.length === 3) {
//                 this.finalResult = [...finalSymbols];
//             }
            
//             this.stopRequested = true;
            
//             if (onStopComplete) {
//                 const originalResolve = this.spinPromiseResolve;
//                 this.spinPromiseResolve = (symbols) => {
//                     if (originalResolve) originalResolve(symbols);
//                     onStopComplete();
//                 };
//             }
//         }, delay);
        
//         return this.currentSymbols;
//     }

//     public setFinalResult(finalSymbols?: SymbolType[], onComplete?: () => void): void {
//         console.log(`[Reel ${this.node.name}] setFinalResult 被調用: ${finalSymbols?.join(', ')}`);
        
//         if (finalSymbols && finalSymbols.length === 3) {
//             this.currentSymbols = [...finalSymbols];
            
//             // 強制更新可見區域的nodes
//             const sortedNodes = [...this.symbolNodes].sort((a, b) => b.position.y - a.position.y);
//             for (let i = 0; i < 3; i++) {
//                 const nodeIndex = this.bufferSymbolCount + i;
//                 const targetNode = sortedNodes[nodeIndex];
//                 const spriteIndex = this.symbolNodes.indexOf(targetNode);
//                 if (spriteIndex >= 0) {
//                     this.updateSpriteFrame(this.symbolSprites[spriteIndex], finalSymbols[i]);
//                 }
//             }
            
//             this.updateCellDisplay();
//         }
        
//         if (onComplete) {
//             onComplete();
//         }
//     }

//     public getCurrentSymbols(): SymbolType[] {
//         return [...this.currentSymbols];
//     }

//     public isSpinning(): boolean {
//         return this.spinning;
//     }

//     // === 輔助方法 ===

//     private finishSpin() {
//         if (this.spinPromiseResolve) {
//             this.spinPromiseResolve([...this.currentSymbols]);
//             this.spinPromiseResolve = null;
//         }
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

//     onDestroy() {
//         this.spinPromiseResolve = null;
//     }
// }
