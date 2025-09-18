// Reel.ts - 改進版滾輪效果，實現真實的滾輪往下滾動
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
        console.log(`[Reel ${this.node.name}] 檢查綁定...`);
        
        if (this.cellSprites.length !== 3) {
            console.error(`[Reel ${this.node.name}] cellSprites 必須有 3 個元素`);
            return;
        }
        
        if (!this.reelContent) {
            console.error(`[Reel ${this.node.name}] reelContent 未綁定`);
            return;
        }
        
        if (this.symbolFrames.length !== 3) {
            console.error(`[Reel ${this.node.name}] symbolFrames 必須有 3 個元素`);
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
            
            // 設置圖片
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
        console.log(`[Reel ${this.node.name}] 開始滾動，持續時間: ${spinDuration}秒`);
        
        this.spinning = true;
        this.stopFlag = false;
        this.finalSymbols = finalSymbols || null;
        
        return new Promise((resolve) => {
            this.spinPromiseResolve = resolve;
            
            // 開始連續滾動
            this.startContinuousRoll();
        });
    }

    // 強制停止滾動
    public forceStop(finalSymbols?: SymbolType[]): SymbolType[] {
        console.log(`[Reel ${this.node.name}] 強制停止滾動`);
        
        this.stopFlag = true;
        this.finalSymbols = finalSymbols || this.finalSymbols;
        
        this.stopRolling();
        return this.currentSymbols;
    }

    // 開始連續滾動動畫
    private startContinuousRoll() {
        if (!this.reelContent || this.stopFlag) return;
        
        // 停止之前的動畫
        this.stopRollingAnimation();
        
        // 計算滾動參數
        const rollSpeed = 20; // 每次滾動的速度（毫秒）
        const rollDistance = this.symbolHeight / 5; // 每次滾動的距離
        
        // 開始連續滾動
        this.continuousRoll(rollDistance, rollSpeed);
    }

    private continuousRoll(distance: number, speed: number) {
        if (this.stopFlag || !this.spinning) return;
        
        const currentY = this.reelContent.position.y;
        const newY = currentY - distance;
        
        this.rollTween = tween(this.reelContent)
            .to(speed / 1000, { position: new Vec3(0, newY, 0) })
            .call(() => {
                // 檢查是否需要循環
                this.checkAndLoopSymbols();
                
                // 隨機更新符號內容（模擬快速滾動）
                this.randomizeContentSymbols();
                
                // 繼續滾動
                if (!this.stopFlag && this.spinning) {
                    this.continuousRoll(distance, speed);
                }
            })
            .start();
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

    // 停止滾動並設置最終結果
    private stopRolling() {
        console.log(`[Reel ${this.node.name}] 停止滾動，最終符號:`, this.finalSymbols);
        
        this.spinning = false;
        this.stopRollingAnimation();
        
        // 如果有指定最終符號，設置它們
        if (this.finalSymbols) {
            this.setFinalSymbols(this.finalSymbols);
        }
        
        // 添加減速停止效果
        this.addDecelerationEffect(() => {
            // 最終停止後的回調
            this.updateCellDisplay();
            
            if (this.spinPromiseResolve) {
                this.spinPromiseResolve([...this.currentSymbols]);
                this.spinPromiseResolve = null;
            }
        });
    }

    // 設置最終符號並調整位置
    private setFinalSymbols(symbols: SymbolType[]) {
        if (symbols.length !== 3) return;
        
        // 設置可見區域的符號
        const startIndex = this.bufferSymbolCount;
        for (let i = 0; i < 3; i++) {
            this.contentSymbols[startIndex + i] = symbols[i];
        }
        
        this.currentSymbols = [...symbols];
        this.updateContentDisplay();
    }

    // 添加減速效果
    private addDecelerationEffect(callback: () => void) {
        if (!this.reelContent) {
            callback();
            return;
        }
        
        // 模擬減速：先快速滾動幾格，然後慢慢停下
        const decelerationSteps = [
            { distance: this.symbolHeight * 0.3, duration: 0.1 },
            { distance: this.symbolHeight * 0.2, duration: 0.15 },
            { distance: this.symbolHeight * 0.1, duration: 0.2 }
        ];
        
        let currentStep = 0;
        const executeStep = () => {
            if (currentStep >= decelerationSteps.length) {
                // 最後對齊到準確位置
                this.alignToExactPosition();
                // this.addBounceEffect(callback);
                return;
            }
            
            const step = decelerationSteps[currentStep];
            const currentY = this.reelContent.position.y;
            
            tween(this.reelContent)
                .to(step.duration, { position: new Vec3(0, currentY - step.distance, 0) })
                .call(() => {
                    currentStep++;
                    executeStep();
                })
                .start();
        };
        
        executeStep();
    }

    // 對齊到準確位置
    private alignToExactPosition() {
        if (!this.reelContent) return;
        
        const targetY = -this.bufferSymbolCount * this.symbolHeight;
        this.reelContent.setPosition(0, targetY, 0);
    }

    // 添加彈跳效果
    // private addBounceEffect(callback: () => void) {
    //     if (!this.reelContent) {
    //         callback();
    //         return;
    //     }
        
    //     const originalScale = this.reelContent.scale.clone();
        
    //     tween(this.reelContent)
    //         .to(0.1, { scale: new Vec3(1.05, 0.95, 1) })
    //         .to(0.1, { scale: new Vec3(0.98, 1.02, 1) })
    //         .to(0.1, { scale: originalScale })
    //         .call(callback)
    //         .start();
    // }

    // 更新滾動內容的顯示
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

    // 更新Cell顯示（用於連線檢查）
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

    // 停止滾動動畫
    private stopRollingAnimation() {
        if (this.rollTween) {
            this.rollTween.stop();
            this.rollTween = null;
        }
    }

    // 獲取當前符號
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


// // Reel.ts - 修正版滾輪效果（增加詳細日誌和錯誤檢查）
// import { _decorator, Component, Sprite, SpriteFrame, tween, Vec3 } from 'cc';
// import { SymbolType, SymbolNames } from './SymbolConfig';
// const { ccclass, property } = _decorator;

// @ccclass('Reel')
// export class Reel extends Component {
//   // 一個 Reel 包含 3 個顯示的 Cell（從上到下）
//   @property([Sprite])
//   public cellSprites: Sprite[] = []; // 長度應為 3，對應上中下

//   @property([SpriteFrame])
//   public symbolFrames: SpriteFrame[] = [];

//   // 滾動相關
//   private spinning = false;
//   private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
//   private rollTween: any = null;
//   private rollInterval: any = null; // 改用 setInterval
//   private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C]; // 當前顯示的 3 個符號

//   start() {
//     console.log(`[Reel ${this.node.name}] 初始化開始`);
    
//     // 檢查綁定
//     this.checkBindings();
    
//     // 初始化顯示
//     this.updateDisplay();
    
//     console.log(`[Reel ${this.node.name}] 初始化完成，當前符號:`, this.currentSymbols);
//   }

//   // 檢查綁定是否正確
//   private checkBindings() {
//     console.log(`[Reel ${this.node.name}] 檢查綁定...`);
//     console.log(`cellSprites 數量: ${this.cellSprites.length}`);
//     console.log(`symbolFrames 數量: ${this.symbolFrames.length}`);
    
//     if (this.cellSprites.length !== 3) {
//       console.error(`[Reel ${this.node.name}] cellSprites 必須有 3 個元素，目前有 ${this.cellSprites.length} 個`);
//       return;
//     }
    
//     if (this.symbolFrames.length !== 3) {
//       console.error(`[Reel ${this.node.name}] symbolFrames 必須有 3 個元素，目前有 ${this.symbolFrames.length} 個`);
//       return;
//     }
    
//     for (let i = 0; i < this.cellSprites.length; i++) {
//       if (!this.cellSprites[i]) {
//         console.error(`[Reel ${this.node.name}] cellSprites[${i}] 未綁定`);
//       } else {
//         console.log(`[Reel ${this.node.name}] cellSprites[${i}] 綁定到節點: ${this.cellSprites[i].node.name}`);
//       }
//     }
    
//     for (let i = 0; i < this.symbolFrames.length; i++) {
//       if (!this.symbolFrames[i]) {
//         console.error(`[Reel ${this.node.name}] symbolFrames[${i}] 未綁定`);
//       } else {
//         console.log(`[Reel ${this.node.name}] symbolFrames[${i}] 已綁定: ${this.symbolFrames[i].name}`);
//       }
//     }
//   }

//   // 開始滾動，返回最終的 3 個符號
//   public spin(spinDuration = 1, finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
//     console.log(`[Reel ${this.node.name}] 開始滾動，持續時間: ${spinDuration}秒`);
    
//     this.spinning = true;
//     return new Promise((resolve) => {
//       this.spinPromiseResolve = resolve;
      
//       // 開始滾動動畫
//       this.startRolling();
      
//       // 預定最終符號（如果沒提供則隨機生成）
//       // const targetSymbols = finalSymbols || [
//       //   SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
//       //   SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
//       //   SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//       // ];
      
//       // console.log(`[Reel ${this.node.name}] 目標符號:`, targetSymbols);
      
//       // 定時停止
//       setTimeout(() => {
//         if (this.spinning) {
//           this.stopRolling;
//           // this.stopRolling(targetSymbols);
//         }
//       }, spinDuration * 1000);
//     });
//   }

//   // 強制停止滾動
//   public forceStop(finalSymbols?: SymbolType[]): SymbolType[] {
//     console.log(`[Reel ${this.node.name}] 強制停止滾動`);
    
//     const targetSymbols = finalSymbols || [
//       SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
//       SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
//       SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//     ];
    
//     this.stopRolling(targetSymbols);
//     return this.currentSymbols;
//   }

//   // 開始滾動動畫
//   private startRolling() {
//     console.log(`[Reel ${this.node.name}] 開始滾動動畫`);
    
//     // 停止之前的動畫
//     this.stopRollingAnimation();
    
//     // 使用 setInterval 快速更新符號
//     this.rollInterval = setInterval(() => {
//       if (!this.spinning) {
//         return;
//       }
      
//       // 生成新的隨機符號組合
//       this.currentSymbols = [
//         SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
//         SymbolNames[Math.floor(Math.random() * SymbolNames.length)],
//         SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//       ];
      
//       this.updateDisplay();
      
//       // 添加縮放效果模擬滾動
//       // this.addRollingEffect();
      
//     }, 100); // 每 100ms 更新一次符號
//   }

//   // 添加滾動時的視覺效果
//   private addRollingEffect() {
//     for (let i = 0; i < this.cellSprites.length; i++) {
//       if (this.cellSprites[i]) {
//         const sprite = this.cellSprites[i];
        
//         // 快速縮放效果
//         sprite.node.setScale(0.9, 1.1);
        
//         // 恢復原始大小
//         setTimeout(() => {
//           if (sprite && sprite.node) {
//             sprite.node.setScale(1, 1);
//           }
//         }, 50);
//       }
//     }
//   }

//   // 停止滾動並設定最終符號
//   private stopRolling(finalSymbols?: SymbolType[]) {
//     console.log(`[Reel ${this.node.name}] 停止滾動，最終符號:`, finalSymbols);
    
//     this.spinning = false;
//     this.stopRollingAnimation();
    
//     if (finalSymbols) {
//       this.currentSymbols = [...finalSymbols];
//     }
    
//     this.updateDisplay();
    
//     // 添加停止時的彈跳效果
//     // this.addStopBounce();
    
//     if (this.spinPromiseResolve) {
//       this.spinPromiseResolve([...this.currentSymbols]);
//       this.spinPromiseResolve = null;
//     }
//   }

//   // 停止滾動動畫
//   private stopRollingAnimation() {
//     if (this.rollInterval) {
//       clearInterval(this.rollInterval);
//       this.rollInterval = null;
//     }
    
//     if (this.rollTween) {
//       this.rollTween.stop();
//       this.rollTween = null;
//     }
//   }

//   // 添加停止時的彈跳效果
//   private addStopBounce() {
//     console.log(`[Reel ${this.node.name}] 添加彈跳效果`);
    
//     // 對所有 cell 添加彈跳效果
//     for (let i = 0; i < this.cellSprites.length; i++) {
//       if (this.cellSprites[i]) {
//         const sprite = this.cellSprites[i];
//         const originalScale = sprite.node.scale.clone();
        
//         // 創建彈跳動畫
//         tween(sprite.node)
//           .to(0.1, { scale: new Vec3(1.2, 0.8, 1) })
//           .to(0.1, { scale: new Vec3(0.9, 1.1, 1) })
//           .to(0.1, { scale: originalScale })
//           .start();
//       }
//     }
//   }

//   // 更新顯示
//   private updateDisplay() {
//     console.log(`[Reel ${this.node.name}] 更新顯示，當前符號:`, this.currentSymbols);
    
//     for (let i = 0; i < Math.min(3, this.cellSprites.length, this.currentSymbols.length); i++) {
//       if (!this.cellSprites[i]) {
//         console.error(`[Reel ${this.node.name}] cellSprites[${i}] 為 null，無法更新顯示`);
//         continue;
//       }
      
//       if (!this.currentSymbols[i]) {
//         console.error(`[Reel ${this.node.name}] currentSymbols[${i}] 為 null`);
//         continue;
//       }
      
//       const symbolIndex = SymbolNames.indexOf(this.currentSymbols[i]);
//       console.log(`[Reel ${this.node.name}] 位置 ${i}: 符號 ${this.currentSymbols[i]} -> 索引 ${symbolIndex}`);
      
//       if (symbolIndex >= 0 && symbolIndex < this.symbolFrames.length && this.symbolFrames[symbolIndex]) {
//         console.log(`[Reel ${this.node.name}] 設置 cellSprites[${i}] 的 spriteFrame 為 ${this.symbolFrames[symbolIndex].name}`);
//         this.cellSprites[i].spriteFrame = this.symbolFrames[symbolIndex];
        
//         // 額外檢查設置是否成功
//         if (this.cellSprites[i].spriteFrame === this.symbolFrames[symbolIndex]) {
//           console.log(`[Reel ${this.node.name}] 位置 ${i} spriteFrame 設置成功`);
//         } else {
//           console.error(`[Reel ${this.node.name}] 位置 ${i} spriteFrame 設置失敗`);
//         }
//       } else {
//         console.error(`[Reel ${this.node.name}] 無法設置符號 ${this.currentSymbols[i]} 到位置 ${i}，symbolIndex: ${symbolIndex}`);
//       }
//     }
//   }

//   // 獲取當前符號
//   public getCurrentSymbols(): SymbolType[] {
//     return [...this.currentSymbols];
//   }

//   // 獲取中間符號（用於連線檢查）
//   public getMiddleSymbol(): SymbolType {
//     return this.currentSymbols[1]; // 中間位置的符號
//   }

//   public isSpinning() {
//     return this.spinning;
//   }

//   onDestroy() {
//     console.log(`[Reel ${this.node.name}] 銷毀`);
//     this.stopRollingAnimation();
//   }
// }
