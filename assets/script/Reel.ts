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