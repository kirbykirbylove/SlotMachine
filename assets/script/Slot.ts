// Slot.ts
import { _decorator, Component, Sprite, SpriteFrame } from 'cc';
import { Reel } from './Reel';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

@ccclass('Slot')
export class Slot extends Component {
    @property([Reel]) reels: Reel[] = [];
    @property([Sprite]) cells: Sprite[] = [];
    @property([SpriteFrame]) spriteFrames: SpriteFrame[] = [];
    @property startDelayBetweenReels = 0.3;
    @property stopDelayBetweenReels = 0.6;
    @property autoStopDelay = 1;
    @property stopImmediatelyDelayBetweenReels = 0.2;

    private onThirdReelStartCallback: (() => void) | null = null;
    private onSpinCompleteCallback: ((symbols: SymbolType[]) => void) | null = null;
    private finalSymbols: SymbolType[] | null = null;
    private spinPromises: Promise<SymbolType[]>[] = [];
    private spinAbortController: AbortController | null = null;
    private spinTimeouts: Set<number> = new Set();

    start() {
        console.log('[Slot] 初始化');
    }

    public initialize() {
        const errors = [];
        if (this.reels.length !== 3) errors.push(`需要3個滾輪，當前有 ${this.reels.length} 個`);
        if (this.cells.length !== 9) errors.push(`需要9個格子，當前有 ${this.cells.length} 個`);
        
        if (errors.length > 0) {
            console.error('[Slot]', errors.join('; '));
            return;
        }
        console.log('[Slot] 初始化完成');
    }

    public setOnThirdReelStartCallback(callback: () => void) {
        this.onThirdReelStartCallback = callback;
    }

    public setOnSpinCompleteCallback(callback: (symbols: SymbolType[]) => void) {
        this.onSpinCompleteCallback = callback;
    }

    public async startSpin(finalSymbols: SymbolType[]): Promise<void> {
        if (!finalSymbols || finalSymbols.length !== 9) {
            const error = '最終符號數組必須包含9個符號';
            console.error('[Slot]', error, finalSymbols);
            throw new Error(error);
        }
        
        console.log('[Slot] 開始旋轉，最終符號:', finalSymbols);
        this.finalSymbols = [...finalSymbols];
        this.spinAbortController = new AbortController();
        
        try {
            await this.startReelsSequentially();
            this.scheduleAutoStop();
        } catch (error) {
            console.error('[Slot] 開始旋轉失敗:', error);
            throw error;
        }
    }

    public async stopSpin(immediate: boolean): Promise<void> {
        console.log(`[Slot] 停止旋轉，immediate: ${immediate}`);
        
        try {
            this.clearAllTimeouts();
            await this.stopAllReels(immediate);
            this.completeSpin();
        } catch (error) {
            console.error('[Slot] 停止旋轉失敗:', error);
            throw error;
        }
    }

    public setResultDisplay(symbols: SymbolType[]) {
        if (!symbols || symbols.length !== 9) return;

        symbols.forEach((symbol, i) => {
            if (i >= this.cells.length) return;
            
            const symbolIndex = SymbolNames.indexOf(symbol);
            if (symbolIndex >= 0 && this.spriteFrames?.[symbolIndex]) {
                try {
                    this.cells[i].spriteFrame = this.spriteFrames[symbolIndex];
                } catch (e) {
                    console.warn(`[Slot] 設置格子 ${i} 圖片失敗:`, e);
                }
            }
        });
    }

    public cleanup() {
        console.log('[Slot] 清理資源');
        this.clearAllTimeouts();
        this.abortSpin();
    }

    private async startReelsSequentially() {
        const reelStartPromises = this.reels.map((reel, i) => {
            if (!reel) return Promise.resolve([]);

            return new Promise<SymbolType[]>((resolve, reject) => {
                this.setTimeout(async () => {
                    try {
                        if (this.spinAbortController?.signal.aborted) {
                            resolve([]);
                            return;
                        }

                        const finalReelSymbols = this.getFinalReelSymbols(i);
                        console.log(`[Slot] 啟動 Reel ${i}, 最終符號:`, finalReelSymbols);
                        
                        if (i === 2 && this.onThirdReelStartCallback) {
                            this.onThirdReelStartCallback();
                        }
                        
                        const result = await reel.spin(finalReelSymbols);
                        resolve(result);
                    } catch (error) {
                        console.error(`[Slot] Reel ${i} 啟動失敗:`, error);
                        reject(error);
                    }
                }, i * this.startDelayBetweenReels * 1000);
            });
        });

        this.spinPromises = reelStartPromises;

        try {
            await Promise.allSettled(reelStartPromises.map(p => 
                Promise.race([p, this.sleep(100)])
            ));
        } catch (error) {
            console.error('[Slot] 啟動滾輪時發生錯誤:', error);
            throw error;
        }
    }

    private scheduleAutoStop() {
        const autoStopTime = ((this.reels.length - 1) * this.startDelayBetweenReels + this.autoStopDelay) * 1000;
        
        this.setTimeout(async () => {
            console.log('[Slot] 觸發自動停止');
            await this.stopAllReels(false);
            this.completeSpin();
        }, autoStopTime);
    }

    private async stopAllReels(immediate: boolean) {
        console.log(`[Slot] 開始停止所有滾輪，immediate: ${immediate}`);
        
        const delay = immediate ? this.stopImmediatelyDelayBetweenReels : this.stopDelayBetweenReels;
        
        try {
            const stopPromises = this.reels.map((reel, i) => 
                this.createReelStopPromise(reel, i, delay)
            );

            console.log(`[Slot] 等待 ${stopPromises.length} 個滾輪停止`);

            await Promise.race([
                Promise.all(stopPromises),
                this.sleep(8000).then(() => {
                    console.error('[Slot] 停止滾輪總體超時 (8秒)');
                    return Promise.resolve();
                })
            ]);

            console.log('[Slot] 所有滾輪停止流程完成');

            if (this.spinPromises.length > 0) {
                console.log('[Slot] 等待所有 spin promises 完成');
                await Promise.race([
                    Promise.allSettled(this.spinPromises),
                    this.sleep(2000).then(() => {
                        console.warn('[Slot] Spin promises 超時，繼續執行');
                        return [];
                    })
                ]);
            }
        } catch (error) {
            console.error('[Slot] 停止滾輪時發生錯誤:', error);
        }
    }

    private createReelStopPromise(reel: Reel | null, index: number, delay: number): Promise<void> {
        if (!reel) return Promise.resolve();

        return new Promise<void>((resolve) => {
            setTimeout(() => {
                try {
                    const finalReelSymbols = this.getFinalReelSymbols(index);
                    console.log(`[Slot] 停止 Reel ${index}, 最終符號:`, finalReelSymbols);
                    
                    const safetyTimeout = setTimeout(() => {
                        console.warn(`[Slot] Reel ${index} 回調超時，強制 resolve`);
                        resolve();
                    }, 2000);
                    
                    const onComplete = () => {
                        clearTimeout(safetyTimeout);
                        console.log(`[Slot] Reel ${index} 停止完成`);
                        resolve();
                    };
                    
                    const method = reel.isSpinning() ? 'forceStop' : 'setFinalResult';
                    console.log(`[Slot] Reel ${index} ${reel.isSpinning() ? '正在滾動' : '未在滾動'}，調用 ${method}`);
                    
                    if (method === 'forceStop') {
                        reel.forceStop(finalReelSymbols, onComplete, 0.1);
                    } else {
                        reel.setFinalResult(finalReelSymbols, onComplete);
                    }
                } catch (error) {
                    console.error(`[Slot] 停止 Reel ${index} 時發生錯誤:`, error);
                    resolve();
                }
            }, index * delay * 1000);
        });
    }

    private completeSpin() {
        console.log('[Slot] 旋轉完成');
        
        if (this.finalSymbols?.length === 9) {
            this.setResultDisplay(this.finalSymbols);
            this.onSpinCompleteCallback?.([...this.finalSymbols]);
        }
    }

    private getFinalReelSymbols(reelIndex: number): SymbolType[] {
        if (!this.finalSymbols || this.finalSymbols.length !== 9) {
            console.warn('[Slot] 最終符號無效，生成隨機符號');
            return Array.from({length: 3}, () => 
                SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
            );
        }

        const reelSymbols = [
            this.finalSymbols[reelIndex],
            this.finalSymbols[3 + reelIndex],
            this.finalSymbols[6 + reelIndex]
        ];

        console.log(`[Slot] Reel ${reelIndex} 最終符號:`, reelSymbols);
        return reelSymbols;
    }

    private setTimeout(callback: () => void, delay: number): number {
        const timeoutId = window.setTimeout(() => {
            this.spinTimeouts.delete(timeoutId);
            try {
                callback();
            } catch (error) {
                console.error('[Slot] 定時器回調錯誤:', error);
            }
        }, delay);
        
        this.spinTimeouts.add(timeoutId);
        return timeoutId;
    }

    private clearAllTimeouts() {
        this.spinTimeouts.forEach(id => clearTimeout(id));
        this.spinTimeouts.clear();
    }

    private abortSpin() {
        if (this.spinAbortController) {
            this.spinAbortController.abort();
            this.spinAbortController = null;
        }
        this.spinPromises = [];
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    onDestroy() {
        console.log('[Slot] 銷毀');
        this.cleanup();
    }
}

// // Slot.ts
// import { _decorator, Component, Sprite, SpriteFrame } from 'cc';
// import { Reel } from './Reel';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// @ccclass('Slot')
// export class Slot extends Component {
//     @property([Reel])
//     public reels: Reel[] = [];
//     @property([Sprite])
//     public cells: Sprite[] = [];
//     @property([SpriteFrame])
//     public spriteFrames: SpriteFrame[] = [];

//     // 时序配置
//     @property public startDelayBetweenReels = 0.3;
//     @property public stopDelayBetweenReels = 0.6;
//     @property public autoStopDelay = 1;
//     @property public stopImmediatelyDelayBetweenReels = 0.2;

//     // 回调函数
//     private onThirdReelStartCallback: (() => void) | null = null;
//     private onSpinCompleteCallback: ((symbols: SymbolType[]) => void) | null = null;

//     // 状态管理
//     private finalSymbols: SymbolType[] | null = null;
//     private spinPromises: Promise<SymbolType[]>[] = [];
//     private spinAbortController: AbortController | null = null;
//     private spinTimeouts: Set<number> = new Set();

//     start() {
//         console.log('[Slot] 初始化');
//     }

//     public initialize() {
//         console.log('[Slot] 开始初始化');
//         if (this.reels.length !== 3) {
//             console.error(`[Slot] 需要3个滚轮，当前有 ${this.reels.length} 个`);
//             return;
//         }
//         if (this.cells.length !== 9) {
//             console.error(`[Slot] 需要9个格子，当前有 ${this.cells.length} 个`);
//             return;
//         }
//         console.log('[Slot] 初始化完成');
//     }

//     public setOnThirdReelStartCallback(callback: () => void) {
//         this.onThirdReelStartCallback = callback;
//     }

//     public setOnSpinCompleteCallback(callback: (symbols: SymbolType[]) => void) {
//         this.onSpinCompleteCallback = callback;
//     }

//     public async startSpin(finalSymbols: SymbolType[]): Promise<void> {
//         console.log('[Slot] 开始旋转，最终符号:', finalSymbols);
        
//         if (!finalSymbols || finalSymbols.length !== 9) {
//             console.error('[Slot] 最终符号数组无效:', finalSymbols);
//             throw new Error('最终符号数组必须包含9个符号');
//         }
        
//         this.finalSymbols = [...finalSymbols]; // 创建副本避免引用问题
//         this.spinAbortController = new AbortController();
        
//         try {
//             await this.startReelsSequentially();
//             this.scheduleAutoStop();
//         } catch (error) {
//             console.error('[Slot] 开始旋转失败:', error);
//             throw error;
//         }
//     }

//     public async stopSpin(immediate: boolean): Promise<void> {
//         console.log(`[Slot] 停止旋转，immediate: ${immediate}`);
        
//         try {
//             // 取消所有延时器
//             this.clearAllTimeouts();
            
//             // 停止所有滚轮
//             await this.stopAllReels(immediate);
            
//             // 完成旋转
//             this.completeSpin();
//         } catch (error) {
//             console.error('[Slot] 停止旋转失败:', error);
//             throw error;
//         }
//     }

//     public setResultDisplay(symbols: SymbolType[]) {
//         if (!symbols || symbols.length !== 9) return;

//         symbols.forEach((symbol, i) => {
//             if (i < this.cells.length) {
//                 const symbolIndex = SymbolNames.indexOf(symbol);
//                 if (symbolIndex >= 0 && this.spriteFrames?.[symbolIndex]) {
//                     try {
//                         this.cells[i].spriteFrame = this.spriteFrames[symbolIndex];
//                     } catch (e) {
//                         console.warn(`[Slot] 设置格子 ${i} 图片失败:`, e);
//                     }
//                 }
//             }
//         });
//     }

//     public cleanup() {
//         console.log('[Slot] 清理资源');
//         this.clearAllTimeouts();
//         this.abortSpin();
//     }

//     private async startReelsSequentially() {
//         // 为每个滚轮创建延迟启动的 Promise
//         const reelStartPromises = this.reels.map((reel, i) => {
//             if (!reel) return Promise.resolve([]);

//             return new Promise<SymbolType[]>((resolve, reject) => {
//                 const timeoutId = this.setTimeout(async () => {
//                     try {
//                         if (!this.spinAbortController?.signal.aborted) {
//                             const finalReelSymbols = this.getFinalReelSymbols(i);
//                             console.log(`[Slot] 启动 Reel ${i}, 最终符号:`, finalReelSymbols);
                            
//                             // 第三轴启动时触发回调
//                             if (i === 2 && this.onThirdReelStartCallback) {
//                                 this.onThirdReelStartCallback();
//                             }
                            
//                             // 启动滚轮
//                             const result = await reel.spin(finalReelSymbols);
//                             resolve(result);
//                         } else {
//                             resolve([]);
//                         }
//                     } catch (error) {
//                         console.error(`[Slot] Reel ${i} 启动失败:`, error);
//                         reject(error);
//                     }
//                 }, i * this.startDelayBetweenReels * 1000);
//             });
//         });

//         this.spinPromises = reelStartPromises;

//         try {
//             await Promise.allSettled(reelStartPromises.map(p => 
//                 Promise.race([p, this.sleep(100)])
//             ));
//         } catch (error) {
//             console.error('[Slot] 启动滚轮时发生错误:', error);
//             throw error;
//         }
//     }

//     private scheduleAutoStop() {
//         const lastReelStartTime = (this.reels.length - 1) * this.startDelayBetweenReels * 1000;
//         const autoStopTime = lastReelStartTime + (this.autoStopDelay * 1000);
        
//         this.setTimeout(async () => {
//             console.log('[Slot] 触发自动停止');
//             await this.stopAllReels(false);
//             this.completeSpin();
//         }, autoStopTime);
//     }

//     private async stopAllReels(immediate: boolean) {
//         console.log(`[Slot] 开始停止所有滚轮，immediate: ${immediate}`);
        
//         const delay = immediate ? this.stopImmediatelyDelayBetweenReels : this.stopDelayBetweenReels;
        
//         try {
//             const stopPromises = this.reels.map((reel, i) => {
//                 if (!reel) return Promise.resolve();

//                 return new Promise<void>((resolve) => {
//                     this.setTimeout(() => {
//                         try {
//                             const finalReelSymbols = this.getFinalReelSymbols(i);
//                             console.log(`[Slot] 停止 Reel ${i}, 最终符号:`, finalReelSymbols);
                            
//                             if (reel.isSpinning()) {
//                                 console.log(`[Slot] Reel ${i} 正在滚动，调用 forceStop`);
//                                 reel.forceStop(finalReelSymbols, () => {
//                                     console.log(`[Slot] Reel ${i} forceStop 回调执行`);
//                                     resolve();
//                                 }, 0.1);
//                             } else {
//                                 console.log(`[Slot] Reel ${i} 未在滚动，调用 setFinalResult`);
//                                 reel.setFinalResult(finalReelSymbols, () => {
//                                     console.log(`[Slot] Reel ${i} setFinalResult 回调执行`);
//                                     resolve();
//                                 });
//                             }
//                         } catch (error) {
//                             console.error(`[Slot] 停止 Reel ${i} 时发生错误:`, error);
//                             resolve();
//                         }
//                     }, i * delay * 1000);
//                 });
//             });

//             console.log(`[Slot] 等待 ${stopPromises.length} 个滚轮停止`);

//             const timeoutPromise = this.sleep(5000).then(() => {
//                 console.error('[Slot] 停止滚轮超时 (5秒)');
//                 throw new Error('停止滚轮超时');
//             });

//             await Promise.race([
//                 Promise.all(stopPromises),
//                 timeoutPromise
//             ]);

//             console.log('[Slot] 所有滚轮已停止');

//             // 等待所有原始的 spin promises 完成
//             if (this.spinPromises.length > 0) {
//                 console.log('[Slot] 等待所有 spin promises 完成');
//                 const spinTimeout = this.sleep(3000).then(() => {
//                     console.warn('[Slot] Spin promises 超时，继续执行');
//                     return [];
//                 });
                
//                 await Promise.race([
//                     Promise.allSettled(this.spinPromises),
//                     spinTimeout
//                 ]);
//             }

//         } catch (error) {
//             console.error('[Slot] 停止滚轮时发生错误:', error);
//             throw error;
//         }
//     }

//     private completeSpin() {
//         console.log('[Slot] 旋转完成');
        
//         if (this.finalSymbols?.length === 9) {
//             this.setResultDisplay(this.finalSymbols);
            
//             if (this.onSpinCompleteCallback) {
//                 this.onSpinCompleteCallback([...this.finalSymbols]);
//             }
//         }
//     }

//     private getFinalReelSymbols(reelIndex: number): SymbolType[] {
//         if (!this.finalSymbols || this.finalSymbols.length !== 9) {
//             console.warn('[Slot] 最终符号无效，生成随机符号');
//             return Array.from({length: 3}, () => 
//                 SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//             );
//         }

//         // 符号排列：
//         // 0 1 2  <- Reel 0, 1, 2 的第一行
//         // 3 4 5  <- Reel 0, 1, 2 的第二行  
//         // 6 7 8  <- Reel 0, 1, 2 的第三行
//         const reelSymbols = [
//             this.finalSymbols[reelIndex],     // 第一行
//             this.finalSymbols[3 + reelIndex], // 第二行
//             this.finalSymbols[6 + reelIndex]  // 第三行
//         ];

//         console.log(`[Slot] Reel ${reelIndex} 最终符号:`, reelSymbols);
//         return reelSymbols;
//     }

//     private setTimeout(callback: () => void, delay: number): number {
//         const timeoutId = window.setTimeout(() => {
//             this.spinTimeouts.delete(timeoutId);
//             try {
//                 callback();
//             } catch (error) {
//                 console.error('[Slot] 定时器回调错误:', error);
//             }
//         }, delay);
        
//         this.spinTimeouts.add(timeoutId);
//         return timeoutId;
//     }

//     private clearAllTimeouts() {
//         this.spinTimeouts.forEach(id => clearTimeout(id));
//         this.spinTimeouts.clear();
//     }

//     private abortSpin() {
//         if (this.spinAbortController) {
//             this.spinAbortController.abort();
//             this.spinAbortController = null;
//         }
//         this.spinPromises = [];
//     }

//     private sleep(ms: number): Promise<void> {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     onDestroy() {
//         console.log('[Slot] 销毁');
//         this.cleanup();
//     }
// }

// // Slot.ts
// import { _decorator, Component, Sprite, SpriteFrame } from 'cc';
// import { Reel } from './Reel';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// @ccclass('Slot')
// export class Slot extends Component {
//     @property([Reel])
//     public reels: Reel[] = [];
//     @property([Sprite])
//     public cells: Sprite[] = [];
//     @property([SpriteFrame])
//     public spriteFrames: SpriteFrame[] = [];

//     // 时序配置
//     @property public startDelayBetweenReels = 0.3;
//     @property public stopDelayBetweenReels = 0.6;
//     @property public autoStopDelay = 1;
//     @property public stopImmediatelyDelayBetweenReels = 0.2;

//     // 回调函数
//     private onThirdReelStartCallback: (() => void) | null = null;
//     private onSpinCompleteCallback: ((symbols: SymbolType[]) => void) | null = null;

//     // 状态管理
//     private finalSymbols: SymbolType[] | null = null;
//     private spinPromises: Promise<SymbolType[]>[] = [];
//     private spinAbortController: AbortController | null = null;
//     private spinTimeouts: Set<number> = new Set();

//     start() {
//         console.log('[Slot] 初始化');
//     }

//     public initialize() {
//         console.log('[Slot] 开始初始化');
//         if (this.reels.length !== 3) {
//             console.error(`[Slot] 需要3个滚轮，当前有 ${this.reels.length} 个`);
//             return;
//         }
//         if (this.cells.length !== 9) {
//             console.error(`[Slot] 需要9个格子，当前有 ${this.cells.length} 个`);
//             return;
//         }
//         console.log('[Slot] 初始化完成');
//     }

//     public setOnThirdReelStartCallback(callback: () => void) {
//         this.onThirdReelStartCallback = callback;
//     }

//     public setOnSpinCompleteCallback(callback: (symbols: SymbolType[]) => void) {
//         this.onSpinCompleteCallback = callback;
//     }

//     public async startSpin(finalSymbols: SymbolType[]): Promise<void> {
//         console.log('[Slot] 开始旋转，最终符号:', finalSymbols);
        
//         this.finalSymbols = finalSymbols;
//         this.spinAbortController = new AbortController();
        
//         try {
//             await this.startReelsSequentially();
//             this.scheduleAutoStop();
//         } catch (error) {
//             console.error('[Slot] 开始旋转失败:', error);
//             throw error;
//         }
//     }

//     public async stopSpin(immediate: boolean): Promise<void> {
//         console.log(`[Slot] 停止旋转，immediate: ${immediate}`);
        
//         try {
//             // 取消所有延时器
//             this.clearAllTimeouts();
            
//             // 停止所有滚轮
//             await this.stopAllReels(immediate);
            
//             // 完成旋转
//             this.completeSpin();
//         } catch (error) {
//             console.error('[Slot] 停止旋转失败:', error);
//             throw error;
//         }
//     }

//     public setResultDisplay(symbols: SymbolType[]) {
//         if (!symbols || symbols.length !== 9) return;

//         symbols.forEach((symbol, i) => {
//             if (i < this.cells.length) {
//                 const symbolIndex = SymbolNames.indexOf(symbol);
//                 if (symbolIndex >= 0 && this.spriteFrames?.[symbolIndex]) {
//                     try {
//                         this.cells[i].spriteFrame = this.spriteFrames[symbolIndex];
//                     } catch (e) {
//                         console.warn(`[Slot] 设置格子 ${i} 图片失败:`, e);
//                     }
//                 }
//             }
//         });
//     }

//     public cleanup() {
//         console.log('[Slot] 清理资源');
//         this.clearAllTimeouts();
//         this.abortSpin();
//     }

//     private async startReelsSequentially() {
//         // 为每个滚轮创建延迟启动的 Promise
//         const reelStartPromises = this.reels.map((reel, i) => {
//             if (!reel) return Promise.resolve([]);

//             return new Promise<SymbolType[]>((resolve, reject) => {
//                 const timeoutId = this.setTimeout(async () => {
//                     try {
//                         if (!this.spinAbortController?.signal.aborted) {
//                             const finalReelSymbols = this.getFinalReelSymbols(i);
//                             console.log(`[Slot] 启动 Reel ${i}, 最终符号:`, finalReelSymbols);
                            
//                             // 第三轴启动时触发回调
//                             if (i === 2 && this.onThirdReelStartCallback) {
//                                 this.onThirdReelStartCallback();
//                             }
                            
//                             // 启动滚轮
//                             const result = await reel.spin(finalReelSymbols);
//                             resolve(result);
//                         } else {
//                             resolve([]);
//                         }
//                     } catch (error) {
//                         console.error(`[Slot] Reel ${i} 启动失败:`, error);
//                         reject(error);
//                     }
//                 }, i * this.startDelayBetweenReels * 1000);
//             });
//         });

//         this.spinPromises = reelStartPromises;

//         try {
//             await Promise.allSettled(reelStartPromises.map(p => 
//                 Promise.race([p, this.sleep(100)])
//             ));
//         } catch (error) {
//             console.error('[Slot] 启动滚轮时发生错误:', error);
//             throw error;
//         }
//     }

//     private scheduleAutoStop() {
//         const lastReelStartTime = (this.reels.length - 1) * this.startDelayBetweenReels * 1000;
//         const autoStopTime = lastReelStartTime + (this.autoStopDelay * 1000);
        
//         this.setTimeout(async () => {
//             console.log('[Slot] 触发自动停止');
//             await this.stopAllReels(false);
//             this.completeSpin();
//         }, autoStopTime);
//     }

//     private async stopAllReels(immediate: boolean) {
//         console.log(`[Slot] 开始停止所有滚轮，immediate: ${immediate}`);
        
//         const delay = immediate ? this.stopImmediatelyDelayBetweenReels : this.stopDelayBetweenReels;
        
//         try {
//             const stopPromises = this.reels.map((reel, i) => {
//                 if (!reel) return Promise.resolve();

//                 return new Promise<void>((resolve) => {
//                     this.setTimeout(() => {
//                         try {
//                             const finalReelSymbols = this.getFinalReelSymbols(i);
//                             console.log(`[Slot] 停止 Reel ${i}, 最终符号:`, finalReelSymbols);
                            
//                             if (reel.isSpinning()) {
//                                 console.log(`[Slot] Reel ${i} 正在滚动，调用 forceStop`);
//                                 reel.forceStop(finalReelSymbols, () => {
//                                     console.log(`[Slot] Reel ${i} forceStop 回调执行`);
//                                     resolve();
//                                 }, 0.1);
//                             } else {
//                                 console.log(`[Slot] Reel ${i} 未在滚动，调用 setFinalResult`);
//                                 reel.setFinalResult(finalReelSymbols, () => {
//                                     console.log(`[Slot] Reel ${i} setFinalResult 回调执行`);
//                                     resolve();
//                                 });
//                             }
//                         } catch (error) {
//                             console.error(`[Slot] 停止 Reel ${i} 时发生错误:`, error);
//                             resolve();
//                         }
//                     }, i * delay * 1000);
//                 });
//             });

//             console.log(`[Slot] 等待 ${stopPromises.length} 个滚轮停止`);

//             const timeoutPromise = this.sleep(5000).then(() => {
//                 console.error('[Slot] 停止滚轮超时 (5秒)');
//                 throw new Error('停止滚轮超时');
//             });

//             await Promise.race([
//                 Promise.all(stopPromises),
//                 timeoutPromise
//             ]);

//             console.log('[Slot] 所有滚轮已停止');

//             // 等待所有原始的 spin promises 完成
//             if (this.spinPromises.length > 0) {
//                 console.log('[Slot] 等待所有 spin promises 完成');
//                 const spinTimeout = this.sleep(3000).then(() => {
//                     console.warn('[Slot] Spin promises 超时，继续执行');
//                     return [];
//                 });
                
//                 await Promise.race([
//                     Promise.allSettled(this.spinPromises),
//                     spinTimeout
//                 ]);
//             }

//         } catch (error) {
//             console.error('[Slot] 停止滚轮时发生错误:', error);
//             throw error;
//         }
//     }

//     private completeSpin() {
//         console.log('[Slot] 旋转完成');
        
//         if (this.finalSymbols?.length === 9) {
//             this.setResultDisplay(this.finalSymbols);
            
//             if (this.onSpinCompleteCallback) {
//                 this.onSpinCompleteCallback([...this.finalSymbols]);
//             }
//         }
//     }

//     private getFinalReelSymbols(reelIndex: number): SymbolType[] {
//         if (!this.finalSymbols || this.finalSymbols.length !== 9) {
//             return Array.from({length: 3}, () => 
//                 SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//             );
//         }

//         return [
//             this.finalSymbols[reelIndex],
//             this.finalSymbols[3 + reelIndex],
//             this.finalSymbols[6 + reelIndex]
//         ];
//     }

//     private setTimeout(callback: () => void, delay: number): number {
//         const timeoutId = window.setTimeout(() => {
//             this.spinTimeouts.delete(timeoutId);
//             try {
//                 callback();
//             } catch (error) {
//                 console.error('[Slot] 定时器回调错误:', error);
//             }
//         }, delay);
        
//         this.spinTimeouts.add(timeoutId);
//         return timeoutId;
//     }

//     private clearAllTimeouts() {
//         this.spinTimeouts.forEach(id => clearTimeout(id));
//         this.spinTimeouts.clear();
//     }

//     private abortSpin() {
//         if (this.spinAbortController) {
//             this.spinAbortController.abort();
//             this.spinAbortController = null;
//         }
//         this.spinPromises = [];
//     }

//     private sleep(ms: number): Promise<void> {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     onDestroy() {
//         console.log('[Slot] 销毁');
//         this.cleanup();
//     }
// }
