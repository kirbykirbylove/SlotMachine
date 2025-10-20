// // Reel.ts
// import { _decorator, Component, Sprite, SpriteFrame, Vec3, Node } from 'cc';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// @ccclass('Reel')
// export class Reel extends Component {
//     @property([Sprite]) cellSprites: Sprite[] = [];
//     @property(Node) reelContent: Node = null!;
//     @property([SpriteFrame]) symbolFrames: SpriteFrame[] = [];
//     @property symbolHeight: number = 100;
//     @property visibleSymbolCount: number = 3;
//     @property bufferSymbolCount: number = 2;
//     @property baseScrollSpeed: number = 300;
//     @property accelerationTime: number = 0.3;
//     @property maxSpeedMultiplier: number = 3;
//     @property decelerationTime: number = 0.8;

//     private spinning = false;
//     private stopFlag = false;
//     private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
//     private finalSymbols: SymbolType[] | null = null;
//     private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
//     private reelStrip: SymbolType[] = [];
//     private stripPosition: number = 0;
//     private symbolNodes: Node[] = [];
//     private symbolSprites: Sprite[] = [];
//     private currentSpeed: number = 0;
//     private rollPhase: 'accelerating' | 'spinning' | 'decelerating' | 'idle' = 'idle';
//     private phaseStartTime: number = 0;
//     private targetStripPosition: number = 0;
//     private totalDecelerationDistance: number = 0;
//     private decelerationStartPosition: number = 0;
//     private plannedFinalSymbols: SymbolType[] | null = null;

//     start() {
//         if (this.cellSprites.length !== 3 || !this.reelContent) {
//             console.error(`[Reel ${this.node.name}] 配置錯誤`);
//             return;
//         }
        
//         console.log(`[Reel ${this.node.name}] ===== 符號更換邏輯 =====`);
//         console.log(`可見符號數: ${this.visibleSymbolCount}`);
//         console.log(`緩衝符號數: ${this.bufferSymbolCount}`);
//         console.log(`符號在可見區內不會換圖，只在緩衝區換圖`);
        
//         this.initializeReel();
//     }

//     update(dt: number) {
//         if (!this.spinning) return;
        
//         this.updateSpeed(dt);
        
//         const moveDistance = this.currentSpeed * dt;
        
//         // 先檢查回收
//         const shouldRecycle = this.checkIfNeedRecycle();
//         if (shouldRecycle) {
//             this.performNodeRecycling();
//         }
        
//         // 更新邏輯位置
//         this.stripPosition += moveDistance / this.symbolHeight;
        
//         // 移動容器
//         const currentY = this.reelContent.position.y;
//         const newY = currentY - moveDistance;
//         this.reelContent.setPosition(0, newY, 0);
        
//         // 更新符號（關鍵修改在這裡）
//         this.updateAllSymbols();
//     }

//     private initializeReel() {
//         this.currentSymbols = Array.from({length: 3}, () => 
//             SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//         );
        
//         this.generateReelStrip();
//         this.setupReelNodes();
//         this.updateAllSymbols();
//         this.updateCellDisplay();
        
//         console.log(`[Reel ${this.node.name}] 初始化完成`);
//     }

//     private generateReelStrip() {
//         const stripLength = 200;
//         this.reelStrip = [];
        
//         if (this.currentSymbols.length === 3) {
//             this.reelStrip.push(...this.currentSymbols);
//             for (let i = 3; i < stripLength; i++) {
//                 this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//             }
//             this.stripPosition = 0;
//         } else {
//             for (let i = 0; i < stripLength; i++) {
//                 this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//             }
//             this.stripPosition = 0;
//         }
//     }

//     private setupReelNodes() {
//         this.reelContent.removeAllChildren();
//         this.symbolNodes = [];
//         this.symbolSprites = [];

//         const totalNodes = this.visibleSymbolCount + (this.bufferSymbolCount * 2);

//         for (let i = 0; i < totalNodes; i++) {
//             const symbolNode = new Node(`Symbol_${i}`);
//             const sprite = symbolNode.addComponent(Sprite);
//             sprite.sizeMode = Sprite.SizeMode.CUSTOM;
//             sprite.node.setContentSize(this.symbolHeight, this.symbolHeight);
            
//             const yPosition = (totalNodes - 1 - i) * this.symbolHeight;
//             symbolNode.setPosition(0, yPosition, 0);
            
//             this.reelContent.addChild(symbolNode);
//             this.symbolNodes.push(symbolNode);
//             this.symbolSprites.push(sprite);
//         }

//         const initialY = -this.bufferSymbolCount * this.symbolHeight;
//         this.reelContent.setPosition(0, initialY, 0);
//     }

//     private updateSpeed(dt: number) {
//         const currentTime = Date.now();
//         const elapsedTime = (currentTime - this.phaseStartTime) / 1000;

//         switch (this.rollPhase) {
//             case 'accelerating':
//                 if (elapsedTime >= this.accelerationTime) {
//                     this.rollPhase = 'spinning';
//                     this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
//                 } else {
//                     const progress = elapsedTime / this.accelerationTime;
//                     const speedMultiplier = 1 + (this.maxSpeedMultiplier - 1) * this.easeOutCubic(progress);
//                     this.currentSpeed = this.baseScrollSpeed * speedMultiplier;
//                 }
//                 break;

//             case 'spinning':
//                 if (this.stopFlag) {
//                     this.prepareForStop();
//                     this.rollPhase = 'decelerating';
//                     this.phaseStartTime = currentTime;
//                 }
//                 this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
//                 break;

//             case 'decelerating':
//                 if (elapsedTime >= this.decelerationTime) {
//                     this.completeSpin();
//                 } else {
//                     const progress = elapsedTime / this.decelerationTime;
//                     const easeProgress = this.easeInCubic(progress);
//                     this.adjustTowardsFinalPosition(easeProgress);
//                     const speedMultiplier = this.maxSpeedMultiplier * (1 - easeProgress);
//                     this.currentSpeed = this.baseScrollSpeed * Math.max(speedMultiplier, 0.1);
//                 }
//                 break;
//         }
//     }

//     private checkIfNeedRecycle(): boolean {
//         const currentY = this.reelContent.position.y;
//         const recycleThreshold = -this.symbolHeight * (this.bufferSymbolCount + 1);
//         return currentY <= recycleThreshold;
//     }

//     private performNodeRecycling() {
//         console.log(`[Reel ${this.node.name}] 🔄 觸發回收`);
        
//         // 步驟1: 容器向上移動
//         const currentY = this.reelContent.position.y;
//         const newY = currentY + this.symbolHeight;
//         this.reelContent.setPosition(0, newY, 0);
        
//         // 步驟2: 回收最下面的節點
//         const bottomNode = this.symbolNodes.pop()!;
//         const bottomSprite = this.symbolSprites.pop()!;
        
//         this.symbolNodes.unshift(bottomNode);
//         this.symbolSprites.unshift(bottomSprite);
        
//         // 步驟3: 重新計算節點坐標
//         this.symbolNodes.forEach((node, index) => {
//             const yPosition = (this.symbolNodes.length - 1 - index) * this.symbolHeight;
//             node.setPosition(0, yPosition, 0);
//         });
        
//         // 步驟4: stripPosition 前進
//         this.stripPosition += 1;
        
//         // 步驟5: 擴展滾輪帶
//         if (Math.floor(this.stripPosition) > this.reelStrip.length - 20) {
//             this.extendReelStrip();
//         }
//     }

//     private extendReelStrip() {
//         const extensionLength = 50;
//         for (let i = 0; i < extensionLength; i++) {
//             this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//         }
//     }

//     /**
//      * ✅ 關鍵修正：符號更換邏輯
//      * 
//      * 原邏輯：基於 Math.floor(stripPosition) 換圖
//      * 問題：符號在可見區內就會換圖
//      * 
//      * 新邏輯：延遲換圖，只在節點移到不可見區才換
//      */
//     private updateAllSymbols() {
//         const baseStripIndex = Math.floor(this.stripPosition);
        
//         this.symbolSprites.forEach((sprite, nodeIndex) => {
//             // ✅ 關鍵修正：計算節點對應的滾輪帶索引
//             // 
//             // 原始映射（會在可見區換圖）：
//             // stripIndex = baseStripIndex + nodeIndex - bufferSymbolCount
//             // 
//             // 新映射（延遲換圖）：
//             // 只有當節點完全移出可見區（進入緩衝區）才讀取新符號
            
//             let stripIndex: number;
            
//             // 計算節點在滾輪帶中的"固定位置"
//             // 節點0對應 stripPosition-2（上緩衝）
//             // 節點1對應 stripPosition-1（上緩衝）
//             // 節點2對應 stripPosition+0（可見1）
//             // 節點3對應 stripPosition+1（可見2）
//             // 節點4對應 stripPosition+2（可見3）
//             // 節點5對應 stripPosition+3（下緩衝）
//             // 節點6對應 stripPosition+4（下緩衝）
            
//             // ✅ 修正：使用整數部分，確保符號在可見區內不變
//             const offset = nodeIndex - this.bufferSymbolCount;
//             stripIndex = baseStripIndex + offset;
            
//             // 處理負數索引
//             while (stripIndex < 0) {
//                 stripIndex += this.reelStrip.length;
//             }
//             stripIndex = stripIndex % this.reelStrip.length;
            
//             const symbol = this.reelStrip[stripIndex];
//             this.updateSpriteFrame(sprite, symbol);
//         });

//         this.updateCurrentSymbols();
//     }

//     private updateCurrentSymbols() {
//         const baseStripIndex = Math.floor(this.stripPosition);
//         this.currentSymbols = [];
        
//         for (let i = 0; i < 3; i++) {
//             let stripIndex = baseStripIndex + i;
//             while (stripIndex < 0) stripIndex += this.reelStrip.length;
//             stripIndex = stripIndex % this.reelStrip.length;
//             this.currentSymbols.push(this.reelStrip[stripIndex]);
//         }
//     }

//     // private prepareForStop() {
//     //     if (!this.finalSymbols || this.finalSymbols.length !== 3) {
//     //         this.targetStripPosition = Math.floor(this.stripPosition) + 10;
//     //         this.plannedFinalSymbols = null;
//     //         return;
//     //     }

//     //     const stopDistance = 8;
//     //     this.targetStripPosition = Math.floor(this.stripPosition) + stopDistance;
        
//     //     const baseTargetIndex = this.targetStripPosition % this.reelStrip.length;
//     //     for (let i = 0; i < 3; i++) {
//     //         let stripIndex = (baseTargetIndex + i) % this.reelStrip.length;
//     //         this.reelStrip[stripIndex] = this.finalSymbols[i];
//     //     }
        
//     //     this.plannedFinalSymbols = [...this.finalSymbols];
//     //     this.decelerationStartPosition = this.stripPosition;
//     //     this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
//     // }

//     private prepareForStop() {
//     if (!this.finalSymbols || this.finalSymbols.length !== 3) {
//         this.targetStripPosition = Math.floor(this.stripPosition) + 10;
//         this.plannedFinalSymbols = null;
//         return;
//     }

//     // 讓最終結果自然滾動進可視區：
//     // 可視3格 + 下方緩衝2格 => 我們在上方緩衝區外2~4格處預先植入最終符號
//     const stopBufferOffset = this.bufferSymbolCount + this.visibleSymbolCount;
//     const insertBaseIndex = (Math.floor(this.stripPosition) + stopBufferOffset) % this.reelStrip.length;

//     for (let i = 0; i < this.finalSymbols.length; i++) {
//         const insertIndex = (insertBaseIndex + i) % this.reelStrip.length;
//         this.reelStrip[insertIndex] = this.finalSymbols[i];
//     }

//     // 設定最終要對齊的位置（轉到最上方符號剛好到第一可見格）
//     this.targetStripPosition = Math.floor(this.stripPosition) + stopBufferOffset;
//     this.plannedFinalSymbols = [...this.finalSymbols];
//     this.decelerationStartPosition = this.stripPosition;
//     this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
// }

//     private adjustTowardsFinalPosition(progress: number) {
//         if (!this.finalSymbols) return;

//         const expectedPosition = this.decelerationStartPosition + (this.totalDecelerationDistance * progress);
//         const positionDifference = expectedPosition - this.stripPosition;

//         if (Math.abs(positionDifference) > 0.1) {
//             const adjustmentFactor = Math.min(Math.abs(positionDifference) * 0.1, 0.2);
//             if (positionDifference > 0) {
//                 this.currentSpeed += this.baseScrollSpeed * adjustmentFactor;
//             } else {
//                 this.currentSpeed = Math.max(this.currentSpeed - this.baseScrollSpeed * adjustmentFactor, 0.1);
//             }
//         }
//     }

//     private completeSpin() {
//         this.spinning = false;
//         this.stopFlag = false;
//         this.rollPhase = 'idle';
//         this.currentSpeed = 0;

//         if (this.plannedFinalSymbols?.length === 3) {
//             this.stripPosition = this.targetStripPosition;
//             this.currentSymbols = [...this.plannedFinalSymbols];
//             this.finalSymbols = null;
//             this.plannedFinalSymbols = null;
//         } else {
//             this.stripPosition = Math.round(this.stripPosition);
//         }

//         this.updateAllSymbols();
//         this.tweenAlignToStandardPosition();
//     }

//     private tweenAlignToStandardPosition() {
//         const targetY = -this.bufferSymbolCount * this.symbolHeight;
//         const currentY = this.reelContent.position.y;
//         const distance = Math.abs(currentY - targetY);
        
//         if (distance < 5) {
//             this.reelContent.setPosition(0, targetY, 0);
//             this.stripPosition = Math.round(this.stripPosition);
//             this.updateAllSymbols();
//             this.updateCellDisplay();
//             this.finishSpin();
//         } else {
//             import('cc').then(({ tween, Vec3 }) => {
//                 tween(this.reelContent)
//                     .to(0.25, { position: new Vec3(0, targetY, 0) }, { easing: 'cubicOut' })
//                     .call(() => {
//                         this.stripPosition = Math.round(this.stripPosition);
//                         this.updateAllSymbols();
//                         this.updateCellDisplay();
//                         this.finishSpin();
//                     })
//                     .start();
//             });
//         }
//     }

//     private finishSpin() {
//         if (this.spinPromiseResolve) {
//             this.spinPromiseResolve([...this.currentSymbols]);
//             this.spinPromiseResolve = null;
//         }
//     }

//     private easeOutCubic(t: number): number {
//         return 1 - Math.pow(1 - t, 3);
//     }

//     private easeInCubic(t: number): number {
//         return t * t * t;
//     }

//     public spin(finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
//         this.generateReelStrip();
//         this.updateAllSymbols();

//         this.spinning = true;
//         this.stopFlag = false;
//         this.finalSymbols = finalSymbols || null;
//         this.rollPhase = 'accelerating';
//         this.phaseStartTime = Date.now();
//         this.currentSpeed = this.baseScrollSpeed;
//         this.targetStripPosition = 0;
//         this.totalDecelerationDistance = 0;
//         this.decelerationStartPosition = 0;

//         return new Promise((resolve) => {
//             this.spinPromiseResolve = resolve;
//         });
//     }

//     public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 1): SymbolType[] {
//         this.scheduleOnce(() => this.executeStop(finalSymbols, onStopComplete), delay);
//         return this.currentSymbols;
//     }

//     public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
//         this.executeStop(finalSymbols, onComplete);
//     }

//     private executeStop(finalSymbols?: SymbolType[], onComplete?: () => void) {
//         this.finalSymbols = finalSymbols || this.finalSymbols;
//         this.stopFlag = true;

//         if (onComplete) {
//             const originalResolve = this.spinPromiseResolve;
//             this.spinPromiseResolve = (symbols) => {
//                 if (originalResolve) originalResolve(symbols);
//                 onComplete();
//             };
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

//     public getCurrentSymbols(): SymbolType[] {
//         return [...this.currentSymbols];
//     }

//     public isSpinning(): boolean {
//         return this.spinning;
//     }

//     onDestroy() {
//         this.spinPromiseResolve = null;
//     }
// }

// // Reel.ts - 完整最終版本（修正停軸自然性 + 符號綁定模式）
// import { _decorator, Component, Sprite, SpriteFrame, Vec3, Node } from 'cc';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// @ccclass('Reel')
// export class Reel extends Component {
//     @property([Sprite]) cellSprites: Sprite[] = [];
//     @property(Node) reelContent: Node = null!;
//     @property([SpriteFrame]) symbolFrames: SpriteFrame[] = [];
//     @property symbolHeight: number = 100;
//     @property visibleSymbolCount: number = 3;
//     @property bufferSymbolCount: number = 2;
//     @property baseScrollSpeed: number = 300;
//     @property accelerationTime: number = 0.3;
//     @property maxSpeedMultiplier: number = 3;
//     @property decelerationTime: number = 0.8;

//     // 核心狀態
//     private spinning = false;
//     private stopFlag = false;
//     private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
//     private finalSymbols: SymbolType[] | null = null;
    
//     // 符號系統
//     private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
//     private reelStrip: SymbolType[] = [];
//     private stripPosition: number = 0;
    
//     // 節點系統
//     private symbolNodes: Node[] = [];
//     private symbolSprites: Sprite[] = [];
//     private nodeSymbolIndices: number[] = [];  // 每個節點綁定的符號索引
    
//     // 動畫控制
//     private currentSpeed: number = 0;
//     private rollPhase: 'accelerating' | 'spinning' | 'decelerating' | 'idle' = 'idle';
//     private phaseStartTime: number = 0;
    
//     // 停止控制
//     private targetStripPosition: number = 0;
//     private totalDecelerationDistance: number = 0;
//     private decelerationStartPosition: number = 0;
//     private plannedFinalSymbols: SymbolType[] | null = null;

//     start() {
//         if (this.cellSprites.length !== 3 || !this.reelContent) {
//             console.error(`[Reel ${this.node.name}] 配置錯誤: cellSprites=${this.cellSprites.length}, reelContent=${!!this.reelContent}`);
//             return;
//         }
        
//         console.log(`[Reel ${this.node.name}] ===== 初始化 =====`);
//         console.log(`  symbolHeight: ${this.symbolHeight}`);
//         console.log(`  visibleSymbolCount: ${this.visibleSymbolCount}`);
//         console.log(`  bufferSymbolCount: ${this.bufferSymbolCount}`);
        
//         this.initializeReel();
//     }

//     update(dt: number) {
//         if (!this.spinning) return;
        
//         this.updateSpeed(dt);
        
//         const moveDistance = this.currentSpeed * dt;
        
//         // 檢查是否需要回收
//         const shouldRecycle = this.checkIfNeedRecycle();
//         if (shouldRecycle) {
//             this.performNodeRecycling();
//         }
        
//         // 更新邏輯位置
//         this.stripPosition += moveDistance / this.symbolHeight;
        
//         // 移動容器
//         const currentY = this.reelContent.position.y;
//         const newY = currentY - moveDistance;
//         this.reelContent.setPosition(0, newY, 0);
//     }

//     private initializeReel() {
//         // 生成初始符號
//         this.currentSymbols = Array.from({length: 3}, () => 
//             SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//         );
        
//         this.generateReelStrip();
//         this.setupReelNodes();
//         this.updateCellDisplay();
        
//         console.log(`[Reel ${this.node.name}] 初始化完成`);
//     }

//     private generateReelStrip() {
//         const stripLength = 200;
//         this.reelStrip = [];
        
//         if (this.currentSymbols.length === 3) {
//             // 從當前符號開始
//             this.reelStrip.push(...this.currentSymbols);
            
//             // 繼續生成隨機符號
//             for (let i = 3; i < stripLength; i++) {
//                 this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//             }
            
//             this.stripPosition = 0;
//         } else {
//             // 純隨機
//             for (let i = 0; i < stripLength; i++) {
//                 this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//             }
//             this.stripPosition = 0;
//         }
//     }

//     private setupReelNodes() {
//         this.reelContent.removeAllChildren();
//         this.symbolNodes = [];
//         this.symbolSprites = [];
//         this.nodeSymbolIndices = [];

//         const totalNodes = this.visibleSymbolCount + (this.bufferSymbolCount * 2);

//         for (let i = 0; i < totalNodes; i++) {
//             const symbolNode = new Node(`Symbol_${i}`);
//             const sprite = symbolNode.addComponent(Sprite);
//             sprite.sizeMode = Sprite.SizeMode.CUSTOM;
//             sprite.node.setContentSize(this.symbolHeight, this.symbolHeight);
            
//             const yPosition = (totalNodes - 1 - i) * this.symbolHeight;
//             symbolNode.setPosition(0, yPosition, 0);
            
//             this.reelContent.addChild(symbolNode);
//             this.symbolNodes.push(symbolNode);
//             this.symbolSprites.push(sprite);
//             this.nodeSymbolIndices.push(i);
//         }

//         const initialY = -this.bufferSymbolCount * this.symbolHeight;
//         this.reelContent.setPosition(0, initialY, 0);
        
//         // 顯示初始符號
//         this.updateAllNodeSymbols();
//     }

//     private updateSpeed(dt: number) {
//         const currentTime = Date.now();
//         const elapsedTime = (currentTime - this.phaseStartTime) / 1000;

//         switch (this.rollPhase) {
//             case 'accelerating':
//                 if (elapsedTime >= this.accelerationTime) {
//                     this.rollPhase = 'spinning';
//                     this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
//                 } else {
//                     const progress = elapsedTime / this.accelerationTime;
//                     const speedMultiplier = 1 + (this.maxSpeedMultiplier - 1) * this.easeOutCubic(progress);
//                     this.currentSpeed = this.baseScrollSpeed * speedMultiplier;
//                 }
//                 break;

//             case 'spinning':
//                 if (this.stopFlag) {
//                     this.prepareForStop();
//                     this.rollPhase = 'decelerating';
//                     this.phaseStartTime = currentTime;
//                 }
//                 this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
//                 break;

//             case 'decelerating':
//                 if (elapsedTime >= this.decelerationTime) {
//                     this.completeSpin();
//                 } else {
//                     const progress = elapsedTime / this.decelerationTime;
//                     const easeProgress = this.easeInCubic(progress);
//                     this.adjustTowardsFinalPosition(easeProgress);
//                     const speedMultiplier = this.maxSpeedMultiplier * (1 - easeProgress);
//                     this.currentSpeed = this.baseScrollSpeed * Math.max(speedMultiplier, 0.1);
//                 }
//                 break;
//         }
//     }

//     private checkIfNeedRecycle(): boolean {
//         const currentY = this.reelContent.position.y;
//         const recycleThreshold = -this.symbolHeight * (this.bufferSymbolCount + 1);
//         return currentY <= recycleThreshold;
//     }

//     private performNodeRecycling() {
//         // 步驟1: 容器向上移動
//         const currentY = this.reelContent.position.y;
//         const newY = currentY + this.symbolHeight;
//         this.reelContent.setPosition(0, newY, 0);
        
//         // 步驟2: 記錄底部節點的符號索引
//         const bottomNodeSymbolIndex = this.nodeSymbolIndices[this.nodeSymbolIndices.length - 1];
        
//         // 步驟3: 回收節點
//         const bottomNode = this.symbolNodes.pop()!;
//         const bottomSprite = this.symbolSprites.pop()!;
//         this.nodeSymbolIndices.pop();
        
//         this.symbolNodes.unshift(bottomNode);
//         this.symbolSprites.unshift(bottomSprite);
        
//         // 步驟4: 計算新的頂部節點符號索引
//         const newTopSymbolIndex = bottomNodeSymbolIndex + this.symbolNodes.length;
//         this.nodeSymbolIndices.unshift(newTopSymbolIndex);
        
//         // 步驟5: 重新計算節點坐標
//         this.symbolNodes.forEach((node, index) => {
//             const yPosition = (this.symbolNodes.length - 1 - index) * this.symbolHeight;
//             node.setPosition(0, yPosition, 0);
//         });
        
//         // 步驟6: 邏輯位置前進
//         this.stripPosition += 1;
        
//         // 步驟7: 擴展滾輪帶
//         if (Math.floor(this.stripPosition) > this.reelStrip.length - 20) {
//             this.extendReelStrip();
//         }
        
//         // 步驟8: 只更新被回收的節點（新節點0）
//         this.updateSingleNodeSymbol(0);
//     }

//     private extendReelStrip() {
//         const extensionLength = 50;
//         for (let i = 0; i < extensionLength; i++) {
//             this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//         }
//     }

//     private updateAllNodeSymbols() {
//         for (let i = 0; i < this.symbolSprites.length; i++) {
//             this.updateSingleNodeSymbol(i);
//         }
//         this.updateCurrentSymbols();
//     }

//     private updateSingleNodeSymbol(nodeIndex: number) {
//         const sprite = this.symbolSprites[nodeIndex];
//         if (!sprite) return;
        
//         let stripIndex = this.nodeSymbolIndices[nodeIndex];
        
//         // 處理循環
//         while (stripIndex < 0) {
//             stripIndex += this.reelStrip.length;
//         }
//         stripIndex = stripIndex % this.reelStrip.length;
        
//         const symbol = this.reelStrip[stripIndex];
//         this.updateSpriteFrame(sprite, symbol);
//     }

//     private updateCurrentSymbols() {
//         this.currentSymbols = [];
        
//         // 可見符號對應節點 bufferSymbolCount 到 bufferSymbolCount + visibleSymbolCount - 1
//         for (let i = 0; i < this.visibleSymbolCount; i++) {
//             const nodeIndex = this.bufferSymbolCount + i;
//             let stripIndex = this.nodeSymbolIndices[nodeIndex];
            
//             while (stripIndex < 0) {
//                 stripIndex += this.reelStrip.length;
//             }
//             stripIndex = stripIndex % this.reelStrip.length;
            
//             this.currentSymbols.push(this.reelStrip[stripIndex]);
//         }
//     }
//     // // ver 1
//     // private prepareForStop() {
//     //     if (!this.finalSymbols || this.finalSymbols.length !== 3) {
//     //         this.targetStripPosition = Math.floor(this.stripPosition) + 10;
//     //         this.plannedFinalSymbols = null;
//     //         return;
//     //     }

//     //     // 計算停止距離
//     //     const stopDistance = 10;
//     //     this.targetStripPosition = Math.floor(this.stripPosition) + stopDistance;
        
//     //     console.log(`[Reel ${this.node.name}] 準備停止`);
//     //     console.log(`  當前位置: ${this.stripPosition.toFixed(2)}`);
//     //     console.log(`  目標位置: ${this.targetStripPosition}`);
//     //     console.log(`  最終符號:`, this.finalSymbols);
        
//     //     // 植入最終符號到目標位置
//     //     for (let i = 0; i < 3; i++) {
//     //         const stripIndex = (this.targetStripPosition + i) % this.reelStrip.length;
//     //         this.reelStrip[stripIndex] = this.finalSymbols[i];
//     //     }
        
//     //     this.plannedFinalSymbols = [...this.finalSymbols];
//     //     this.decelerationStartPosition = this.stripPosition;
//     //     this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
//     // }

//         private prepareForStop() {
//     if (!this.finalSymbols || this.finalSymbols.length !== 3) {
//         this.targetStripPosition = Math.floor(this.stripPosition) + 10;
//         this.plannedFinalSymbols = null;
//         return;
//     }

//     // ✅ 關鍵修正：提前植入最終符號,讓它們自然滾入
//     // 
//     // 策略：在當前位置的前方（滾輪帶更遠處）植入最終符號
//     // 這樣減速時會自然滾動到這些符號
    
//     // 計算停止距離：需要足夠的距離讓減速看起來自然
//     // 至少要滾過 上緩衝(2) + 可見區(3) + 額外緩衝(3) = 8格
//     const minStopDistance = this.bufferSymbolCount + this.visibleSymbolCount + 3;
    
//     // 在滾輪帶中找一個安全位置植入最終符號
//     // 確保這個位置還沒進入當前的顯示範圍
//     const currentDisplayEnd = Math.floor(this.stripPosition) + this.visibleSymbolCount + this.bufferSymbolCount;
//     const insertPosition = currentDisplayEnd + 5; // 在顯示範圍外5格處植入
    
//     // 植入最終符號到滾輪帶
//     for (let i = 0; i < this.finalSymbols.length; i++) {
//         const insertIndex = (insertPosition + i) % this.reelStrip.length;
//         this.reelStrip[insertIndex] = this.finalSymbols[i];
//     }
    
//     // 設定目標位置：剛好讓第一個最終符號滾到可見區第一格
//     this.targetStripPosition = insertPosition;
    
//     // 記錄計畫和初始狀態
//     this.plannedFinalSymbols = [...this.finalSymbols];
//     this.decelerationStartPosition = this.stripPosition;
//     this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
    
//     console.log(`[Reel ${this.node.name}] 🎯 準備停止:`);
//     console.log(`  當前位置: ${this.stripPosition.toFixed(2)}`);
//     console.log(`  目標位置: ${this.targetStripPosition}`);
//     console.log(`  需滾動距離: ${this.totalDecelerationDistance.toFixed(2)}`);
//     console.log(`  最終符號: ${this.finalSymbols.join(', ')}`);
// }

// // // ver 2
// //     private prepareForStop() {
// //     if (!this.finalSymbols || this.finalSymbols.length !== 3) {
// //         this.targetStripPosition = Math.floor(this.stripPosition) + 10;
// //         this.plannedFinalSymbols = null;
// //         return;
// //     }

// //     // 讓最終結果自然滾動進可視區：
// //     // 可視3格 + 下方緩衝2格 => 我們在上方緩衝區外2~4格處預先植入最終符號
// //     const stopBufferOffset = this.bufferSymbolCount + this.visibleSymbolCount;
// //     const insertBaseIndex = (Math.floor(this.stripPosition) + stopBufferOffset) % this.reelStrip.length;

// //     for (let i = 0; i < this.finalSymbols.length; i++) {
// //         const insertIndex = (insertBaseIndex + i) % this.reelStrip.length;
// //         this.reelStrip[insertIndex] = this.finalSymbols[i];
// //     }

// //     // 設定最終要對齊的位置（轉到最上方符號剛好到第一可見格）
// //     this.targetStripPosition = Math.floor(this.stripPosition) + stopBufferOffset;
// //     this.plannedFinalSymbols = [...this.finalSymbols];
// //     this.decelerationStartPosition = this.stripPosition;
// //     this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
// // }


//     private adjustTowardsFinalPosition(progress: number) {
//         if (!this.finalSymbols) return;

//         const expectedPosition = this.decelerationStartPosition + (this.totalDecelerationDistance * progress);
//         const positionDifference = expectedPosition - this.stripPosition;

//         if (Math.abs(positionDifference) > 0.1) {
//             const adjustmentFactor = Math.min(Math.abs(positionDifference) * 0.1, 0.2);
//             if (positionDifference > 0) {
//                 this.currentSpeed += this.baseScrollSpeed * adjustmentFactor;
//             } else {
//                 this.currentSpeed = Math.max(this.currentSpeed - this.baseScrollSpeed * adjustmentFactor, 0.1);
//             }
//         }
//     }

//     private completeSpin() {
//         console.log(`[Reel ${this.node.name}] 完成旋轉`);
        
//         this.spinning = false;
//         this.stopFlag = false;
//         this.rollPhase = 'idle';
//         this.currentSpeed = 0;

//         if (this.plannedFinalSymbols?.length === 3) {
//             // 強制對齊到目標位置
//             this.stripPosition = this.targetStripPosition;
            
//             // 重新計算所有節點的符號索引
//             const baseIndex = Math.floor(this.stripPosition);
//             for (let i = 0; i < this.nodeSymbolIndices.length; i++) {
//                 const offset = i - this.bufferSymbolCount;
//                 this.nodeSymbolIndices[i] = baseIndex + offset;
//             }
            
//             // 更新所有節點符號
//             this.updateAllNodeSymbols();
            
//             console.log(`  最終符號:`, this.currentSymbols);
            
//             this.finalSymbols = null;
//             this.plannedFinalSymbols = null;
//         } else {
//             this.stripPosition = Math.round(this.stripPosition);
//             this.updateCurrentSymbols();
//         }

//         this.tweenAlignToStandardPosition();
//     }

//     private tweenAlignToStandardPosition() {
//         const targetY = -this.bufferSymbolCount * this.symbolHeight;
//         const currentY = this.reelContent.position.y;
//         const distance = Math.abs(currentY - targetY);
        
//         if (distance < 5) {
//             this.reelContent.setPosition(0, targetY, 0);
//             this.stripPosition = Math.round(this.stripPosition);
//             this.updateCurrentSymbols();
//             this.updateCellDisplay();
//             this.finishSpin();
//         } else {
//             import('cc').then(({ tween, Vec3 }) => {
//                 tween(this.reelContent)
//                     .to(0.25, { position: new Vec3(0, targetY, 0) }, { easing: 'cubicOut' })
//                     .call(() => {
//                         this.stripPosition = Math.round(this.stripPosition);
//                         this.updateCurrentSymbols();
//                         this.updateCellDisplay();
//                         this.finishSpin();
//                     })
//                     .start();
//             });
//         }
//     }

//     private finishSpin() {
//         if (this.spinPromiseResolve) {
//             this.spinPromiseResolve([...this.currentSymbols]);
//             this.spinPromiseResolve = null;
//         }
//     }

//     private easeOutCubic(t: number): number {
//         return 1 - Math.pow(1 - t, 3);
//     }

//     private easeInCubic(t: number): number {
//         return t * t * t;
//     }

//     // ========== 公共接口 ==========

//     public spin(finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
//         console.log(`[Reel ${this.node.name}] 開始滾動`);

//         this.generateReelStrip();
        
//         // 重新初始化節點符號索引
//         this.nodeSymbolIndices = [];
//         for (let i = 0; i < this.symbolNodes.length; i++) {
//             this.nodeSymbolIndices.push(i);
//         }
//         this.updateAllNodeSymbols();

//         this.spinning = true;
//         this.stopFlag = false;
//         this.finalSymbols = finalSymbols || null;
//         this.rollPhase = 'accelerating';
//         this.phaseStartTime = Date.now();
//         this.currentSpeed = this.baseScrollSpeed;
//         this.targetStripPosition = 0;
//         this.totalDecelerationDistance = 0;
//         this.decelerationStartPosition = 0;

//         return new Promise((resolve) => {
//             this.spinPromiseResolve = resolve;
//         });
//     }

//     public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 1): SymbolType[] {
//         this.scheduleOnce(() => this.executeStop(finalSymbols, onStopComplete), delay);
//         return this.currentSymbols;
//     }

//     public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
//         this.executeStop(finalSymbols, onComplete);
//     }

//     private executeStop(finalSymbols?: SymbolType[], onComplete?: () => void) {
//         this.finalSymbols = finalSymbols || this.finalSymbols;
//         this.stopFlag = true;

//         if (onComplete) {
//             const originalResolve = this.spinPromiseResolve;
//             this.spinPromiseResolve = (symbols) => {
//                 if (originalResolve) originalResolve(symbols);
//                 onComplete();
//             };
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

//     public getCurrentSymbols(): SymbolType[] {
//         return [...this.currentSymbols];
//     }

//     public isSpinning(): boolean {
//         return this.spinning;
//     }

//     onDestroy() {
//         this.spinPromiseResolve = null;
//     }
// }

// Reel.ts
import { _decorator, Component, Sprite, SpriteFrame, Vec3, Node } from 'cc';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

@ccclass('Reel')
export class Reel extends Component {
    @property([Sprite]) cellSprites: Sprite[] = [];
    @property(Node) reelContent: Node = null!;
    @property([SpriteFrame]) symbolFrames: SpriteFrame[] = [];
    @property symbolHeight: number = 100;
    @property visibleSymbolCount: number = 3;
    @property bufferSymbolCount: number = 2;
    @property baseScrollSpeed: number = 300;
    @property accelerationTime: number = 0.3;
    @property maxSpeedMultiplier: number = 3;
    @property decelerationTime: number = 0.8;

    private spinning = false;
    private stopFlag = false;
    private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
    private finalSymbols: SymbolType[] | null = null;
    private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
    private reelStrip: SymbolType[] = [];
    private stripPosition: number = 0;
    private symbolNodes: Node[] = [];
    private symbolSprites: Sprite[] = [];
    private currentSpeed: number = 0;
    private rollPhase: 'accelerating' | 'spinning' | 'decelerating' | 'idle' = 'idle';
    private phaseStartTime: number = 0;
    private targetStripPosition: number = 0;
    private totalDecelerationDistance: number = 0;
    private decelerationStartPosition: number = 0;
    private plannedFinalSymbols: SymbolType[] | null = null;

    start() {
        if (this.cellSprites.length !== 3 || !this.reelContent) {
            console.error(`[Reel ${this.node.name}] 配置錯誤`);
            return;
        }
        
        console.log(`[Reel ${this.node.name}] ===== 符號更換邏輯 =====`);
        console.log(`可見符號數: ${this.visibleSymbolCount}`);
        console.log(`緩衝符號數: ${this.bufferSymbolCount}`);
        console.log(`符號在可見區內不會換圖，只在緩衝區換圖`);
        
        this.initializeReel();
    }

    update(dt: number) {
        if (!this.spinning) return;
        
        this.updateSpeed(dt);
        
        const moveDistance = this.currentSpeed * dt;
        
        // 先檢查回收
        const shouldRecycle = this.checkIfNeedRecycle();
        if (shouldRecycle) {
            this.performNodeRecycling();
        }
        
        // 更新邏輯位置
        this.stripPosition += moveDistance / this.symbolHeight;
        
        // 移動容器
        const currentY = this.reelContent.position.y;
        const newY = currentY - moveDistance;
        this.reelContent.setPosition(0, newY, 0);
        
        // 更新符號
        this.updateAllSymbols();
    }

    private initializeReel() {
        this.currentSymbols = Array.from({length: 3}, () => 
            SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
        );
        
        this.generateReelStrip();
        this.setupReelNodes();
        this.updateAllSymbols();
        this.updateCellDisplay();
        
        console.log(`[Reel ${this.node.name}] 初始化完成`);
    }

    /**
     * ✅ 關鍵修正：生成滾輪帶時保留當前可見符號
     * @param preserveCurrentSymbols 是否保留當前符號（SPIN時為true）
     */
    private generateReelStrip(preserveCurrentSymbols: boolean = false) {
        const stripLength = 200;
        this.reelStrip = [];
        
        if (preserveCurrentSymbols && this.currentSymbols.length === 3) {
            // ✅ SPIN時：保留當前3個符號在開頭
            console.log(`[Reel ${this.node.name}] 🔒 保留當前符號: ${this.currentSymbols.join(', ')}`);
            this.reelStrip.push(...this.currentSymbols);
            
            // 後面填充隨機符號
            for (let i = 3; i < stripLength; i++) {
                this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
            }
            
            // stripPosition維持在0，表示當前顯示的就是開頭3個符號
            this.stripPosition = 0;
        } else {
            // ✅ 初始化時：全部隨機
            for (let i = 0; i < stripLength; i++) {
                this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
            }
            this.stripPosition = 0;
        }
    }

    private setupReelNodes() {
        this.reelContent.removeAllChildren();
        this.symbolNodes = [];
        this.symbolSprites = [];

        const totalNodes = this.visibleSymbolCount + (this.bufferSymbolCount * 2);

        for (let i = 0; i < totalNodes; i++) {
            const symbolNode = new Node(`Symbol_${i}`);
            const sprite = symbolNode.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.node.setContentSize(this.symbolHeight, this.symbolHeight);
            
            const yPosition = (totalNodes - 1 - i) * this.symbolHeight;
            symbolNode.setPosition(0, yPosition, 0);
            
            this.reelContent.addChild(symbolNode);
            this.symbolNodes.push(symbolNode);
            this.symbolSprites.push(sprite);
        }

        const initialY = -this.bufferSymbolCount * this.symbolHeight;
        this.reelContent.setPosition(0, initialY, 0);
    }

        private updateSpeed(dt: number) {
        const currentTime = Date.now();
        const elapsedTime = (currentTime - this.phaseStartTime) / 1000;

        switch (this.rollPhase) {
            case 'accelerating':
                if (elapsedTime >= this.accelerationTime) {
                    this.rollPhase = 'spinning';
                    this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
                } else {
                    const progress = elapsedTime / this.accelerationTime;
                    const speedMultiplier = 1 + (this.maxSpeedMultiplier - 1) * this.easeOutCubic(progress);
                    this.currentSpeed = this.baseScrollSpeed * speedMultiplier;
                }
                break;

            case 'spinning':
                if (this.stopFlag) {
                    this.prepareForStop();
                    this.rollPhase = 'decelerating';
                    this.phaseStartTime = currentTime;
                }
                this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
                break;

            case 'decelerating':
                if (elapsedTime >= this.decelerationTime) {
                    this.completeSpin();
                } else {
                    const progress = elapsedTime / this.decelerationTime;
                    const easeProgress = this.easeInCubic(progress);
                    this.adjustTowardsFinalPosition(easeProgress);
                    const speedMultiplier = this.maxSpeedMultiplier * (1 - easeProgress);
                    this.currentSpeed = this.baseScrollSpeed * Math.max(speedMultiplier, 0.1);
                }
                break;
        }
    }

    // private updateSpeed(dt: number) {
    //     const currentTime = Date.now();
    //     const elapsedTime = (currentTime - this.phaseStartTime) / 1000;

    //     switch (this.rollPhase) {
    //         case 'accelerating':
    //             if (elapsedTime >= this.accelerationTime) {
    //                 this.rollPhase = 'spinning';
    //                 this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
    //             } else {
    //                 const progress = elapsedTime / this.accelerationTime;
    //                 const speedMultiplier = 1 + (this.maxSpeedMultiplier - 1) * this.easeOutCubic(progress);
    //                 this.currentSpeed = this.baseScrollSpeed * speedMultiplier;
    //             }
    //             break;

    //         case 'spinning':
    //             if (this.stopFlag) {
    //                 this.prepareForStop();
    //                 this.rollPhase = 'decelerating';
    //                 this.phaseStartTime = currentTime;
    //             }
    //             this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
    //             break;

    //         case 'decelerating':
    //             if (elapsedTime >= this.decelerationTime) {
    //                 this.completeSpin();
    //             } else {
    //                 const progress = elapsedTime / this.decelerationTime;
    //                 const easeProgress = this.easeInCubic(progress);
                    
    //                 // 先調整位置
    //                 this.adjustTowardsFinalPosition(easeProgress);
                    
    //                 // 在最後階段使用更精確的速度控制
    //                 if (progress > 0.85 && this.finalSymbols) {
    //                     const remainingDistance = this.targetStripPosition - this.stripPosition;
    //                     const remainingTime = this.decelerationTime * (1 - progress);
                        
    //                     if (remainingTime > 0) {
    //                         const idealSpeed = (remainingDistance * this.symbolHeight) / remainingTime;
    //                         this.currentSpeed = Math.max(idealSpeed, this.baseScrollSpeed * 0.05);
    //                     } else {
    //                         this.currentSpeed = this.baseScrollSpeed * 0.05;
    //                     }
    //                 } else {
    //                     const speedMultiplier = this.maxSpeedMultiplier * (1 - easeProgress);
    //                     this.currentSpeed = this.baseScrollSpeed * Math.max(speedMultiplier, 0.1);
    //                 }
    //             }
    //             break;
    //     }
    // }

    private checkIfNeedRecycle(): boolean {
        const currentY = this.reelContent.position.y;
        const recycleThreshold = -this.symbolHeight * (this.bufferSymbolCount + 1);
        return currentY <= recycleThreshold;
    }

    private performNodeRecycling() {
        console.log(`[Reel ${this.node.name}] 🔄 觸發回收`);
        
        // 步驟1: 容器向上移動
        const currentY = this.reelContent.position.y;
        const newY = currentY + this.symbolHeight;
        this.reelContent.setPosition(0, newY, 0);
        
        // 步驟2: 回收最下面的節點
        const bottomNode = this.symbolNodes.pop()!;
        const bottomSprite = this.symbolSprites.pop()!;
        
        this.symbolNodes.unshift(bottomNode);
        this.symbolSprites.unshift(bottomSprite);
        
        // 步驟3: 重新計算節點坐標
        this.symbolNodes.forEach((node, index) => {
            const yPosition = (this.symbolNodes.length - 1 - index) * this.symbolHeight;
            node.setPosition(0, yPosition, 0);
        });
        
        // 步驟4: stripPosition 前進
        this.stripPosition += 1;
        
        // 步驟5: 擴展滾輪帶
        if (Math.floor(this.stripPosition) > this.reelStrip.length - 20) {
            this.extendReelStrip();
        }
    }

    private extendReelStrip() {
        const extensionLength = 50;
        for (let i = 0; i < extensionLength; i++) {
            this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
        }
    }

    private updateAllSymbols() {
        const baseStripIndex = Math.floor(this.stripPosition);
        
        this.symbolSprites.forEach((sprite, nodeIndex) => {
            const offset = nodeIndex - this.bufferSymbolCount;
            let stripIndex = baseStripIndex + offset;
            
            while (stripIndex < 0) {
                stripIndex += this.reelStrip.length;
            }
            stripIndex = stripIndex % this.reelStrip.length;
            
            const symbol = this.reelStrip[stripIndex];
            this.updateSpriteFrame(sprite, symbol);
        });

        this.updateCurrentSymbols();
    }

    private updateCurrentSymbols() {
        const baseStripIndex = Math.floor(this.stripPosition);
        this.currentSymbols = [];
        
        for (let i = 0; i < 3; i++) {
            let stripIndex = baseStripIndex + i;
            while (stripIndex < 0) stripIndex += this.reelStrip.length;
            stripIndex = stripIndex % this.reelStrip.length;
            this.currentSymbols.push(this.reelStrip[stripIndex]);
        }
    }

    // private prepareForStop() {
    //     if (!this.finalSymbols || this.finalSymbols.length !== 3) {
    //         this.targetStripPosition = Math.floor(this.stripPosition) + 10;
    //         this.plannedFinalSymbols = null;
    //         return;
    //     }

    //     // 計算停止距離：需要足夠的距離讓減速看起來自然
    //     const minStopDistance = this.bufferSymbolCount + this.visibleSymbolCount + 3;
        
    //     // 在滾輪帶中找一個安全位置植入最終符號
    //     const currentDisplayEnd = Math.floor(this.stripPosition) + this.visibleSymbolCount + this.bufferSymbolCount;
    //     const insertPosition = currentDisplayEnd + 5;
        
    //     // 植入最終符號到滾輪帶
    //     for (let i = 0; i < this.finalSymbols.length; i++) {
    //         const insertIndex = (insertPosition + i) % this.reelStrip.length;
    //         this.reelStrip[insertIndex] = this.finalSymbols[i];
    //     }
        
    //     // 設定目標位置
    //     this.targetStripPosition = insertPosition;
        
    //     // 記錄計畫和初始狀態
    //     this.plannedFinalSymbols = [...this.finalSymbols];
    //     this.decelerationStartPosition = this.stripPosition;
    //     this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
        
    //     console.log(`[Reel ${this.node.name}] 🎯 準備停止:`);
    //     console.log(`  當前位置: ${this.stripPosition.toFixed(2)}`);
    //     console.log(`  目標位置: ${this.targetStripPosition}`);
    //     console.log(`  需滾動距離: ${this.totalDecelerationDistance.toFixed(2)}`);
    //     console.log(`  最終符號: ${this.finalSymbols.join(', ')}`);
    // }

private prepareForStop() {
    if (!this.finalSymbols || this.finalSymbols.length !== 3) {
        this.targetStripPosition = Math.floor(this.stripPosition) + 10;
        this.plannedFinalSymbols = null;
        return;
    }

    // 讓最終結果自然滾動進可視區：
    // 可視3格 + 下方緩衝2格 => 我們在上方緩衝區外2~4格處預先植入最終符號
    const stopBufferOffset = this.bufferSymbolCount + this.visibleSymbolCount;
    const insertBaseIndex = (Math.floor(this.stripPosition) + stopBufferOffset) % this.reelStrip.length;

    for (let i = 0; i < this.finalSymbols.length; i++) {
        const insertIndex = (insertBaseIndex + i) % this.reelStrip.length;
        this.reelStrip[insertIndex] = this.finalSymbols[i];
    }

    // 設定最終要對齊的位置（轉到最上方符號剛好到第一可見格）
    this.targetStripPosition = Math.floor(this.stripPosition) + stopBufferOffset;
    this.plannedFinalSymbols = [...this.finalSymbols];
    this.decelerationStartPosition = this.stripPosition;
    this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
}


    private adjustTowardsFinalPosition(progress: number) {
        if (!this.finalSymbols) return;

        const expectedPosition = this.decelerationStartPosition + (this.totalDecelerationDistance * progress);
        const positionDifference = expectedPosition - this.stripPosition;

        if (progress > 0.7 && Math.abs(positionDifference) > 0.05) {
            const adjustmentFactor = Math.min(Math.abs(positionDifference) * 0.15, 0.3);
            if (positionDifference > 0) {
                this.currentSpeed += this.baseScrollSpeed * adjustmentFactor;
            } else {
                this.currentSpeed = Math.max(this.currentSpeed - this.baseScrollSpeed * adjustmentFactor, this.baseScrollSpeed * 0.1);
            }
        }
    }

    private completeSpin() {
        this.spinning = false;
        this.stopFlag = false;
        this.rollPhase = 'idle';
        this.currentSpeed = 0;

        if (this.plannedFinalSymbols?.length === 3) {
            this.stripPosition = this.targetStripPosition;
            this.currentSymbols = [...this.plannedFinalSymbols];
            this.finalSymbols = null;
            this.plannedFinalSymbols = null;
            
            console.log(`[Reel ${this.node.name}] ✅ 停止完成:`);
            console.log(`  最終位置: ${this.stripPosition}`);
            console.log(`  最終符號: ${this.currentSymbols.join(', ')}`);
        } else {
            this.stripPosition = Math.round(this.stripPosition);
        }

        this.updateAllSymbols();
        this.tweenAlignToStandardPosition();
    }

    private tweenAlignToStandardPosition() {
        const targetY = -this.bufferSymbolCount * this.symbolHeight;
        const currentY = this.reelContent.position.y;
        const distance = Math.abs(currentY - targetY);
        
        // 大幅提高容差，幾乎不做回彈動畫
        if (distance < 30) {
            this.reelContent.setPosition(0, targetY, 0);
            this.stripPosition = Math.round(this.stripPosition);
            this.updateAllSymbols();
            this.updateCellDisplay();
            this.finishSpin();
        } else {
            // 極短、極柔和的微調動畫
            import('cc').then(({ tween, Vec3 }) => {
                tween(this.reelContent)
                    .to(0.08, { position: new Vec3(0, targetY, 0) }, { easing: 'sineOut' })
                    .call(() => {
                        this.stripPosition = Math.round(this.stripPosition);
                        this.updateAllSymbols();
                        this.updateCellDisplay();
                        this.finishSpin();
                    })
                    .start();
            });
        }
    }

    private finishSpin() {
        if (this.spinPromiseResolve) {
            this.spinPromiseResolve([...this.currentSymbols]);
            this.spinPromiseResolve = null;
        }
    }

    private easeOutCubic(t: number): number {
        return 1 - Math.pow(1 - t, 3);
    }

    private easeInCubic(t: number): number {
        return t * t * t;
    }

    /**
     * ✅ 關鍵修正：SPIN時保留當前可見符號
     */
    public spin(finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
        // ✅ 保存當前盤面符號
        console.log(`[Reel ${this.node.name}] 🎬 開始SPIN，當前符號: ${this.currentSymbols.join(', ')}`);
        
        // ✅ 重新生成滾輪帶，但保留當前符號在開頭
        this.generateReelStrip(true);
        
        // ✅ 不立即更新符號，讓當前符號繼續顯示直到滾出可見區
        // this.updateAllSymbols(); // ❌ 移除這行，避免立即換圖
        
        this.spinning = true;
        this.stopFlag = false;
        this.finalSymbols = finalSymbols || null;
        this.rollPhase = 'accelerating';
        this.phaseStartTime = Date.now();
        this.currentSpeed = this.baseScrollSpeed;
        this.targetStripPosition = 0;
        this.totalDecelerationDistance = 0;
        this.decelerationStartPosition = 0;

        return new Promise((resolve) => {
            this.spinPromiseResolve = resolve;
        });
    }

    public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 1): SymbolType[] {
        this.scheduleOnce(() => this.executeStop(finalSymbols, onStopComplete), delay);
        return this.currentSymbols;
    }

    public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
        this.executeStop(finalSymbols, onComplete);
    }

    private executeStop(finalSymbols?: SymbolType[], onComplete?: () => void) {
        this.finalSymbols = finalSymbols || this.finalSymbols;
        this.stopFlag = true;

        if (onComplete) {
            const originalResolve = this.spinPromiseResolve;
            this.spinPromiseResolve = (symbols) => {
                if (originalResolve) originalResolve(symbols);
                onComplete();
            };
        }
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

    public getCurrentSymbols(): SymbolType[] {
        return [...this.currentSymbols];
    }

    public isSpinning(): boolean {
        return this.spinning;
    }

    onDestroy() {
        this.spinPromiseResolve = null;
    }
}

// // Reel.ts - 修正符號更換時機（符號綁定在節點上）
// import { _decorator, Component, Sprite, SpriteFrame, Vec3, Node } from 'cc';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// @ccclass('Reel')
// export class Reel extends Component {
//     @property([Sprite]) cellSprites: Sprite[] = [];
//     @property(Node) reelContent: Node = null!;
//     @property([SpriteFrame]) symbolFrames: SpriteFrame[] = [];
//     @property symbolHeight: number = 100;
//     @property visibleSymbolCount: number = 3;
//     @property bufferSymbolCount: number = 2;
//     @property baseScrollSpeed: number = 300;
//     @property accelerationTime: number = 0.3;
//     @property maxSpeedMultiplier: number = 3;
//     @property decelerationTime: number = 0.8;

//     private spinning = false;
//     private stopFlag = false;
//     private spinPromiseResolve: ((value: SymbolType[]) => void) | null = null;
//     private finalSymbols: SymbolType[] | null = null;
//     private currentSymbols: SymbolType[] = [SymbolType.A, SymbolType.B, SymbolType.C];
//     private reelStrip: SymbolType[] = [];
//     private stripPosition: number = 0;
//     private symbolNodes: Node[] = [];
//     private symbolSprites: Sprite[] = [];
    
//     // ✅ 新增：記錄每個節點對應的符號索引
//     private nodeSymbolIndices: number[] = [];
    
//     private currentSpeed: number = 0;
//     private rollPhase: 'accelerating' | 'spinning' | 'decelerating' | 'idle' = 'idle';
//     private phaseStartTime: number = 0;
//     private targetStripPosition: number = 0;
//     private totalDecelerationDistance: number = 0;
//     private decelerationStartPosition: number = 0;
//     private plannedFinalSymbols: SymbolType[] | null = null;

//     start() {
//         if (this.cellSprites.length !== 3 || !this.reelContent) {
//             console.error(`[Reel ${this.node.name}] 配置錯誤`);
//             return;
//         }
        
//         console.log(`[Reel ${this.node.name}] ===== 符號綁定模式 =====`);
//         console.log(`符號綁定在節點上，只在回收時換圖`);
        
//         this.initializeReel();
//     }

//     update(dt: number) {
//         if (!this.spinning) return;
        
//         this.updateSpeed(dt);
        
//         const moveDistance = this.currentSpeed * dt;
        
//         // 先檢查回收
//         const shouldRecycle = this.checkIfNeedRecycle();
//         if (shouldRecycle) {
//             this.performNodeRecycling();
//         }
        
//         // 更新邏輯位置
//         this.stripPosition += moveDistance / this.symbolHeight;
        
//         // 移動容器
//         const currentY = this.reelContent.position.y;
//         const newY = currentY - moveDistance;
//         this.reelContent.setPosition(0, newY, 0);
        
//         // ✅ 符號不需要每幀更新，只在回收時更新
//         // 因為符號已經綁定在節點上了
//     }

//     private initializeReel() {
//         this.currentSymbols = Array.from({length: 3}, () => 
//             SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//         );
        
//         this.generateReelStrip();
//         this.setupReelNodes();
//         this.updateCellDisplay();
        
//         console.log(`[Reel ${this.node.name}] 初始化完成`);
//     }

//     private generateReelStrip() {
//         const stripLength = 200;
//         this.reelStrip = [];
        
//         if (this.currentSymbols.length === 3) {
//             this.reelStrip.push(...this.currentSymbols);
//             for (let i = 3; i < stripLength; i++) {
//                 this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//             }
//             this.stripPosition = 0;
//         } else {
//             for (let i = 0; i < stripLength; i++) {
//                 this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//             }
//             this.stripPosition = 0;
//         }
//     }

//     private setupReelNodes() {
//         this.reelContent.removeAllChildren();
//         this.symbolNodes = [];
//         this.symbolSprites = [];
//         this.nodeSymbolIndices = [];

//         const totalNodes = this.visibleSymbolCount + (this.bufferSymbolCount * 2);

//         for (let i = 0; i < totalNodes; i++) {
//             const symbolNode = new Node(`Symbol_${i}`);
//             const sprite = symbolNode.addComponent(Sprite);
//             sprite.sizeMode = Sprite.SizeMode.CUSTOM;
//             sprite.node.setContentSize(this.symbolHeight, this.symbolHeight);
            
//             const yPosition = (totalNodes - 1 - i) * this.symbolHeight;
//             symbolNode.setPosition(0, yPosition, 0);
            
//             this.reelContent.addChild(symbolNode);
//             this.symbolNodes.push(symbolNode);
//             this.symbolSprites.push(sprite);
            
//             // ✅ 初始化節點符號索引
//             // 節點 i 對應 reelStrip[i]
//             this.nodeSymbolIndices.push(i);
//         }

//         const initialY = -this.bufferSymbolCount * this.symbolHeight;
//         this.reelContent.setPosition(0, initialY, 0);
        
//         // ✅ 顯示初始符號
//         this.updateNodeSymbols();
//     }

//     private updateSpeed(dt: number) {
//         const currentTime = Date.now();
//         const elapsedTime = (currentTime - this.phaseStartTime) / 1000;

//         switch (this.rollPhase) {
//             case 'accelerating':
//                 if (elapsedTime >= this.accelerationTime) {
//                     this.rollPhase = 'spinning';
//                     this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
//                 } else {
//                     const progress = elapsedTime / this.accelerationTime;
//                     const speedMultiplier = 1 + (this.maxSpeedMultiplier - 1) * this.easeOutCubic(progress);
//                     this.currentSpeed = this.baseScrollSpeed * speedMultiplier;
//                 }
//                 break;

//             case 'spinning':
//                 if (this.stopFlag) {
//                     this.prepareForStop();
//                     this.rollPhase = 'decelerating';
//                     this.phaseStartTime = currentTime;
//                 }
//                 this.currentSpeed = this.baseScrollSpeed * this.maxSpeedMultiplier;
//                 break;

//             case 'decelerating':
//                 if (elapsedTime >= this.decelerationTime) {
//                     this.completeSpin();
//                 } else {
//                     const progress = elapsedTime / this.decelerationTime;
//                     const easeProgress = this.easeInCubic(progress);
//                     this.adjustTowardsFinalPosition(easeProgress);
//                     const speedMultiplier = this.maxSpeedMultiplier * (1 - easeProgress);
//                     this.currentSpeed = this.baseScrollSpeed * Math.max(speedMultiplier, 0.1);
//                 }
//                 break;
//         }
//     }

//     private checkIfNeedRecycle(): boolean {
//         const currentY = this.reelContent.position.y;
//         const recycleThreshold = -this.symbolHeight * (this.bufferSymbolCount + 1);
//         return currentY <= recycleThreshold;
//     }

//     /**
//      * ✅ 關鍵修正：回收時才更新符號
//      */
//     private performNodeRecycling() {
//         console.log(`[Reel ${this.node.name}] 🔄 觸發回收`);
        
//         // 步驟1: 容器向上移動
//         const currentY = this.reelContent.position.y;
//         const newY = currentY + this.symbolHeight;
//         this.reelContent.setPosition(0, newY, 0);
        
//         // 步驟2: 記錄被回收節點的索引
//         const bottomNodeSymbolIndex = this.nodeSymbolIndices[this.nodeSymbolIndices.length - 1];
        
//         // 步驟3: 回收最下面的節點
//         const bottomNode = this.symbolNodes.pop()!;
//         const bottomSprite = this.symbolSprites.pop()!;
//         this.nodeSymbolIndices.pop();
        
//         this.symbolNodes.unshift(bottomNode);
//         this.symbolSprites.unshift(bottomSprite);
        
//         // ✅ 步驟4: 更新被回收節點的符號索引
//         // 被移到最上面的節點應該顯示新的符號
//         // 新符號索引 = 當前最上面的節點索引 + 總節點數
//         const newTopSymbolIndex = bottomNodeSymbolIndex + this.symbolNodes.length;
//         this.nodeSymbolIndices.unshift(newTopSymbolIndex);
        
//         console.log(`  回收節點: 原索引=${bottomNodeSymbolIndex}, 新索引=${newTopSymbolIndex}`);
        
//         // 步驟5: 重新計算節點坐標
//         this.symbolNodes.forEach((node, index) => {
//             const yPosition = (this.symbolNodes.length - 1 - index) * this.symbolHeight;
//             node.setPosition(0, yPosition, 0);
//         });
        
//         // 步驟6: stripPosition 前進
//         this.stripPosition += 1;
        
//         // 步驟7: 擴展滾輪帶
//         if (Math.floor(this.stripPosition) > this.reelStrip.length - 20) {
//             this.extendReelStrip();
//         }
        
//         // ✅ 步驟8: 只更新被回收的節點（新節點0）的符號
//         this.updateNodeSymbol(0);
//     }

//     private extendReelStrip() {
//         const extensionLength = 50;
//         for (let i = 0; i < extensionLength; i++) {
//             this.reelStrip.push(SymbolNames[Math.floor(Math.random() * SymbolNames.length)]);
//         }
//     }

//     /**
//      * ✅ 新增：更新所有節點的符號
//      */
//     private updateNodeSymbols() {
//         this.symbolSprites.forEach((sprite, nodeIndex) => {
//             this.updateNodeSymbol(nodeIndex);
//         });
        
//         // 更新當前可見符號
//         this.updateCurrentSymbols();
//     }

//     /**
//      * ✅ 新增：更新單個節點的符號
//      */
//     private updateNodeSymbol(nodeIndex: number) {
//         const sprite = this.symbolSprites[nodeIndex];
//         if (!sprite) return;
        
//         // 從映射表讀取該節點應該顯示的符號索引
//         let stripIndex = this.nodeSymbolIndices[nodeIndex];
        
//         // 處理循環
//         while (stripIndex < 0) stripIndex += this.reelStrip.length;
//         stripIndex = stripIndex % this.reelStrip.length;
        
//         const symbol = this.reelStrip[stripIndex];
//         this.updateSpriteFrame(sprite, symbol);
        
//         console.log(`  節點${nodeIndex}: stripIndex=${stripIndex}, 符號=${symbol}`);
//     }

//     /**
//      * ✅ 更新當前可見符號（用於最終結果）
//      */
//     private updateCurrentSymbols() {
//         this.currentSymbols = [];
        
//         // 可見符號對應節點2, 3, 4（如果 bufferSymbolCount=2）
//         for (let i = 0; i < this.visibleSymbolCount; i++) {
//             const nodeIndex = this.bufferSymbolCount + i;
//             let stripIndex = this.nodeSymbolIndices[nodeIndex];
            
//             while (stripIndex < 0) stripIndex += this.reelStrip.length;
//             stripIndex = stripIndex % this.reelStrip.length;
            
//             this.currentSymbols.push(this.reelStrip[stripIndex]);
//         }
        
//         console.log(`[Reel ${this.node.name}] 當前可見符號:`, this.currentSymbols);
//     }

//     private prepareForStop() {
//         if (!this.finalSymbols || this.finalSymbols.length !== 3) {
//             this.targetStripPosition = Math.floor(this.stripPosition) + 10;
//             this.plannedFinalSymbols = null;
//             return;
//         }

//         const stopDistance = 8;
//         this.targetStripPosition = Math.floor(this.stripPosition) + stopDistance;
        
//         // ✅ 植入最終符號到目標位置
//         const baseTargetIndex = this.targetStripPosition % this.reelStrip.length;
//         for (let i = 0; i < 3; i++) {
//             let stripIndex = (baseTargetIndex + i) % this.reelStrip.length;
//             this.reelStrip[stripIndex] = this.finalSymbols[i];
//         }
        
//         this.plannedFinalSymbols = [...this.finalSymbols];
//         this.decelerationStartPosition = this.stripPosition;
//         this.totalDecelerationDistance = this.targetStripPosition - this.stripPosition;
        
//         console.log(`[Reel ${this.node.name}] 準備停止 - 目標位置: ${this.targetStripPosition}`);
//     }

//     private adjustTowardsFinalPosition(progress: number) {
//         if (!this.finalSymbols) return;

//         const expectedPosition = this.decelerationStartPosition + (this.totalDecelerationDistance * progress);
//         const positionDifference = expectedPosition - this.stripPosition;

//         if (Math.abs(positionDifference) > 0.1) {
//             const adjustmentFactor = Math.min(Math.abs(positionDifference) * 0.1, 0.2);
//             if (positionDifference > 0) {
//                 this.currentSpeed += this.baseScrollSpeed * adjustmentFactor;
//             } else {
//                 this.currentSpeed = Math.max(this.currentSpeed - this.baseScrollSpeed * adjustmentFactor, 0.1);
//             }
//         }
//     }

//     private completeSpin() {
//         console.log(`[Reel ${this.node.name}] 完成旋轉`);
        
//         this.spinning = false;
//         this.stopFlag = false;
//         this.rollPhase = 'idle';
//         this.currentSpeed = 0;

//         if (this.plannedFinalSymbols?.length === 3) {
//             this.stripPosition = this.targetStripPosition;
            
//             // ✅ 更新節點符號索引以匹配目標位置
//             const baseIndex = Math.floor(this.stripPosition);
//             for (let i = 0; i < this.nodeSymbolIndices.length; i++) {
//                 const offset = i - this.bufferSymbolCount;
//                 this.nodeSymbolIndices[i] = baseIndex + offset;
//             }
            
//             // 更新所有節點符號
//             this.updateNodeSymbols();
            
//             this.currentSymbols = [...this.plannedFinalSymbols];
//             this.finalSymbols = null;
//             this.plannedFinalSymbols = null;
//         } else {
//             this.stripPosition = Math.round(this.stripPosition);
//             this.updateCurrentSymbols();
//         }

//         this.tweenAlignToStandardPosition();
//     }

//     private tweenAlignToStandardPosition() {
//         const targetY = -this.bufferSymbolCount * this.symbolHeight;
//         const currentY = this.reelContent.position.y;
//         const distance = Math.abs(currentY - targetY);
        
//         if (distance < 5) {
//             this.reelContent.setPosition(0, targetY, 0);
//             this.stripPosition = Math.round(this.stripPosition);
//             this.updateCurrentSymbols();
//             this.updateCellDisplay();
//             this.finishSpin();
//         } else {
//             import('cc').then(({ tween, Vec3 }) => {
//                 tween(this.reelContent)
//                     .to(0.15, { position: new Vec3(0, targetY, 0) }, { easing: 'cubicOut' })
//                     .call(() => {
//                         this.stripPosition = Math.round(this.stripPosition);
//                         this.updateCurrentSymbols();
//                         this.updateCellDisplay();
//                         this.finishSpin();
//                     })
//                     .start();
//             });
//         }
//     }

//     private finishSpin() {
//         console.log(`[Reel ${this.node.name}] 最終符號:`, this.currentSymbols);
        
//         if (this.spinPromiseResolve) {
//             this.spinPromiseResolve([...this.currentSymbols]);
//             this.spinPromiseResolve = null;
//         }
//     }

//     private easeOutCubic(t: number): number {
//         return 1 - Math.pow(1 - t, 3);
//     }

//     private easeInCubic(t: number): number {
//         return t * t * t;
//     }

//     public spin(finalSymbols?: SymbolType[]): Promise<SymbolType[]> {
//         console.log(`[Reel ${this.node.name}] 開始滾動`);

//         this.generateReelStrip();
        
//         // ✅ 重新初始化節點符號索引
//         this.nodeSymbolIndices = [];
//         for (let i = 0; i < this.symbolNodes.length; i++) {
//             this.nodeSymbolIndices.push(i);
//         }
//         this.updateNodeSymbols();

//         this.spinning = true;
//         this.stopFlag = false;
//         this.finalSymbols = finalSymbols || null;
//         this.rollPhase = 'accelerating';
//         this.phaseStartTime = Date.now();
//         this.currentSpeed = this.baseScrollSpeed;
//         this.targetStripPosition = 0;
//         this.totalDecelerationDistance = 0;
//         this.decelerationStartPosition = 0;

//         return new Promise((resolve) => {
//             this.spinPromiseResolve = resolve;
//         });
//     }

//     public forceStop(finalSymbols?: SymbolType[], onStopComplete?: () => void, delay: number = 1): SymbolType[] {
//         this.scheduleOnce(() => this.executeStop(finalSymbols, onStopComplete), delay);
//         return this.currentSymbols;
//     }

//     public setFinalResult(finalSymbols: SymbolType[], onComplete?: () => void): void {
//         this.executeStop(finalSymbols, onComplete);
//     }

//     private executeStop(finalSymbols?: SymbolType[], onComplete?: () => void) {
//         this.finalSymbols = finalSymbols || this.finalSymbols;
//         this.stopFlag = true;

//         if (onComplete) {
//             const originalResolve = this.spinPromiseResolve;
//             this.spinPromiseResolve = (symbols) => {
//                 if (originalResolve) originalResolve(symbols);
//                 onComplete();
//             };
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

//     public getCurrentSymbols(): SymbolType[] {
//         return [...this.currentSymbols];
//     }

//     public isSpinning(): boolean {
//         return this.spinning;
//     }

//     onDestroy() {
//         this.spinPromiseResolve = null;
//     }
// }
