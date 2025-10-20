// GameManager.ts
import { _decorator, Component, EditBox, Button, Label } from 'cc';
import { Slot } from './Slot';
import { UIManager } from './UIManager';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

enum GameState {
    IDLE = 'IDLE',
    SPINNING = 'SPINNING',
    STOPPING = 'STOPPING',
    PROCESSING_RESULTS = 'PROCESSING_RESULTS',
    PRESENTING = 'PRESENTING'
}

@ccclass('GameManager')
export class GameManager extends Component {
    @property(Slot) slot: Slot | null = null;
    @property(UIManager) ui: UIManager | null = null;
    @property(EditBox) editBox: EditBox | null = null;
    @property(Button) confirmButton: Button | null = null;
    @property(Button) spinButton: Button | null = null;
    @property(Label) spinButtonLabel: Label | null = null;

    private gameState: GameState = GameState.IDLE;
    private canStop = false;
    private immediateStopRequested = false;
    private customResult: SymbolType[] | null = null;
    private lastWins: any[] = [];
    private singleLineInterval: number | null = null;
    private presentationAbortController: AbortController | null = null;

    start() {
        this.bindEvents();
        this.changeState(GameState.IDLE);
        
        if (this.slot) {
            this.slot.initialize();
            this.slot.setResultDisplay(this.generateRandomSymbols());
        }
    }

    private bindEvents() {
        const addHandler = (button: Button | null, handler: string) => {
            if (!button) return;
            const eventHandler = new Component.EventHandler();
            eventHandler.target = this.node;
            eventHandler.component = 'GameManager';
            eventHandler.handler = handler;
            button.clickEvents.push(eventHandler);
        };

        if (this.spinButton) this.spinButton.node.setSiblingIndex(-1);
        addHandler(this.spinButton, 'onSpinPressed');
        addHandler(this.confirmButton, 'onConfirmPressed');

        if (this.slot) {
            this.slot.setOnThirdReelStartCallback(() => {
                this.canStop = true;
                this.updateSpinInteractable();
                console.log('[GameManager] 第三軸開始啟動，現在可以使用即停功能');
            });

            this.slot.setOnSpinCompleteCallback((finalSymbols: SymbolType[]) => {
                this.onSpinComplete(finalSymbols);
            });
        }
    }

    private changeState(newState: GameState) {
        if (this.gameState === newState) return;
        console.log(`[GameManager] 狀態變更: ${this.gameState} -> ${newState}`);
        this.gameState = newState;
        this.updateSpinInteractable();
    }

    public onConfirmPressed() {
        console.log('[GameManager] 確認按鈕被按下');
        this.customResult = this.parseEditBox();
        
        const message = this.customResult ? '自訂結果已設定！' : '輸入格式錯誤或已清除自訂結果';
        console.log(`[GameManager] ${message}`, this.customResult);
        this.showMessage(message, 3);
    }

    public async onSpinPressed() {
        if (this.gameState === GameState.PROCESSING_RESULTS || 
            this.gameState === GameState.PRESENTING) return;

        if (this.gameState === GameState.SPINNING && this.canStop) {
            console.log('[GameManager] 用戶按下即停');
            this.immediateStopRequested = true;
            await this.stopSpin();
        } else if (this.gameState === GameState.IDLE) {
            this.cleanup();
            await this.startSpin();
        }
    }

    private async startSpin() {
        console.log('[GameManager] 開始遊戲');
        this.resetGameState();
        
        if (!this.slot) return;

        let finalSymbols: SymbolType[];
        if (this.customResult?.length === 9) {
            finalSymbols = [...this.customResult];
            console.log('[GameManager] 使用自訂結果:', finalSymbols);
            this.customResult = null;
            if (this.editBox) this.editBox.string = '';
        } else {
            finalSymbols = this.generateRandomSymbols();
            console.log('[GameManager] 使用隨機結果:', finalSymbols);
        }

        try {
            await this.slot.startSpin(finalSymbols);
        } catch (error) {
            console.error('[GameManager] 開始旋轉失敗:', error);
            this.handleError(error);
        }
    }

    private async stopSpin() {
        console.log('[GameManager] 開始停止旋轉');
        this.changeState(GameState.STOPPING);
        
        if (!this.slot) return;

        try {
            await this.slot.stopSpin(this.immediateStopRequested);
            console.log('[GameManager] 停止旋轉流程完成');
        } catch (error) {
            console.warn('[GameManager] 停止旋轉有警告，但繼續處理:', error.message);
        }
    }

    private onSpinComplete(finalSymbols: SymbolType[]) {
        console.log('[GameManager] 旋轉完成，開始處理結果');
        this.changeState(GameState.PROCESSING_RESULTS);
        this.canStop = false;
        this.processResultsAndPresentation(finalSymbols);
    }

    private cleanup() {
        this.stopSingleLinePresentation();
        this.abortPresentation();
        
        if (this.ui) {
            this.ui.clearLines();
            this.ui.updateScore(0);
            this.ui.showMessage('');
        }
        
        if (this.slot) this.slot.cleanup();
    }

    private resetGameState() {
        this.canStop = false;
        this.immediateStopRequested = false;
        this.changeState(GameState.SPINNING);
    }

    private async processResultsAndPresentation(finalSymbols: SymbolType[]) {
        if (!finalSymbols || finalSymbols.length !== 9) return;

        this.changeState(GameState.PRESENTING);

        const { PaylineChecker } = await import('./PaylineChecker');
        const wins = PaylineChecker.check(finalSymbols);
        const totalScore = wins.reduce((sum: number, w: any) => sum + w.score, 0);
        
        this.lastWins = [...wins];
        this.ui?.updateScore(totalScore);

        if (wins.length === 0) {
            this.changeState(GameState.IDLE);
            return;
        }

        this.presentationAbortController = new AbortController();
        
        try {
            await this.presentWins(wins);
            this.changeState(GameState.IDLE);
            this.startSingleLinePresentation();
        } catch (error: any) {
            if (error.name !== 'AbortError') this.handleError(error);
        }
    }

    private async presentWins(wins: any[]) {
        if (!this.ui) return;

        this.ui.clearLines();
        wins.forEach(w => this.ui!.showLine(w.lineIndex));

        await Promise.race([
            Promise.all(wins.map(w => this.ui!.flashLineTwice(w.lineIndex).catch(() => {}))),
            this.sleep(1500)
        ]);

        if (this.presentationAbortController?.signal.aborted) {
            throw new Error('展演被中止');
        }

        if (wins.length > 1) {
            for (const win of wins) {
                if (this.presentationAbortController?.signal.aborted) {
                    throw new Error('展演被中止');
                }
                this.ui.clearLines();
                this.ui.showLine(win.lineIndex);
                await this.sleep(1000);
            }

            this.ui.clearLines();
            wins.forEach(w => this.ui!.showLine(w.lineIndex));
        }
    }

    private startSingleLinePresentation() {
        if (!this.ui || this.lastWins.length === 0 || this.gameState !== GameState.IDLE) return;

        this.stopSingleLinePresentation();

        let currentIndex = 0;
        const showNextLine = () => {
            if (this.gameState !== GameState.IDLE) {
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
        this.singleLineInterval = setInterval(showNextLine, 1000);
    }

    private stopSingleLinePresentation() {
        if (this.singleLineInterval) {
            clearInterval(this.singleLineInterval);
            this.singleLineInterval = null;
        }
    }

    private abortPresentation() {
        if (this.presentationAbortController) {
            this.presentationAbortController.abort();
            this.presentationAbortController = null;
        }
    }

    private parseEditBox(): SymbolType[] | null {
        if (!this.editBox?.string?.trim()) {
            console.log('[GameManager] EditBox 為空');
            return null;
        }

        const inputString = this.editBox.string.trim();
        const parts = inputString.split(/[,|\s]+/).map(s => s.trim()).filter(Boolean);
        
        console.log('[GameManager] 解析輸入:', inputString, '分割後:', parts);

        if (parts.length !== 9) {
            console.warn(`[GameManager] 符號數量錯誤: 期望9個，實際${parts.length}個`);
            return null;
        }

        const symbols: SymbolType[] = [];
        for (let i = 0; i < parts.length; i++) {
            const symbol = parts[i].toUpperCase() as SymbolType;
            
            if (!SymbolNames.includes(symbol)) {
                console.warn(`[GameManager] 第${i+1}個符號無效: "${parts[i]}" -> "${symbol}"`, '有效符號:', SymbolNames);
                return null;
            }
            symbols.push(symbol);
        }
        
        console.log('[GameManager] 解析成功:', symbols);
        return symbols;
    }

    private generateRandomSymbols(): SymbolType[] {
        return Array.from({length: 9}, () => 
            SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
        );
    }

    private updateSpinInteractable() {
        console.log(`[GameManager] 更新按鈕狀態 - 遊戲狀態: ${this.gameState}, canStop: ${this.canStop}`);
        
        if (this.spinButton) {
            const canInteract = this.gameState === GameState.IDLE || 
                              (this.gameState === GameState.SPINNING && this.canStop);
            this.spinButton.interactable = canInteract;
            console.log(`[GameManager] 按鈕可交互: ${canInteract}`);
        }

        if (this.spinButtonLabel) {
            const buttonTextMap = {
                [GameState.IDLE]: "SPIN",
                [GameState.SPINNING]: this.canStop ? "STOP" : "Waiting",
                [GameState.STOPPING]: "SPIN",
                [GameState.PROCESSING_RESULTS]: "SPIN",
                [GameState.PRESENTING]: "SPIN"
            };
            
            this.spinButtonLabel.string = buttonTextMap[this.gameState];
            console.log(`[GameManager] 按鈕文字設置為: ${this.spinButtonLabel.string}`);
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

    private handleError = (error: any) => {
        console.error('[GameManager] Error:', error);
        this.cleanup();
        this.changeState(GameState.IDLE);
        this.showMessage('遊戲發生錯誤，已重置', 3);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    onDestroy() {
        this.cleanup();
        this.abortPresentation();
    }
}

// // GameManager.ts
// import { _decorator, Component, EditBox, Button, Label } from 'cc';
// import { Slot } from './Slot';
// import { UIManager } from './UIManager';
// import { SymbolType, SymbolNames } from './SymbolConfig';

// const { ccclass, property } = _decorator;

// enum GameState {
//     IDLE = 'IDLE',
//     SPINNING = 'SPINNING',
//     STOPPING = 'STOPPING',
//     PROCESSING_RESULTS = 'PROCESSING_RESULTS',
//     PRESENTING = 'PRESENTING'
// }

// @ccclass('GameManager')
// export class GameManager extends Component {
//     @property(Slot)
//     public slot: Slot | null = null;
//     @property(UIManager)
//     public ui: UIManager | null = null;
//     @property(EditBox)
//     public editBox: EditBox | null = null;
//     @property(Button)
//     public confirmButton: Button | null = null;
//     @property(Button)
//     public spinButton: Button | null = null;
//     @property(Label)
//     public spinButtonLabel: Label | null = null;

//     // 状态管理
//     private gameState: GameState = GameState.IDLE;
//     private canStop = false;
//     private immediateStopRequested = false;
//     private customResult: SymbolType[] | null = null;

//     start() {
//         this.bindEvents();
//         this.changeState(GameState.IDLE);
        
//         if (this.slot) {
//             this.slot.initialize();
//             this.slot.setResultDisplay(this.generateRandomSymbols());
//         }
//     }

//     private bindEvents() {
//         if (this.spinButton) {
//             this.spinButton.node.setSiblingIndex(-1);
//             // 使用 handler 方式注册事件
//             const spinHandler = new Component.EventHandler();
//             spinHandler.target = this.node;
//             spinHandler.component = 'GameManager';
//             spinHandler.handler = 'onSpinPressed';
//             this.spinButton.clickEvents.push(spinHandler);
//         }

//         if (this.confirmButton) {
//             // 使用 handler 方式注册事件
//             const confirmHandler = new Component.EventHandler();
//             confirmHandler.target = this.node;
//             confirmHandler.component = 'GameManager';
//             confirmHandler.handler = 'onConfirmPressed';
//             this.confirmButton.clickEvents.push(confirmHandler);
//         }

//         // 绑定 Slot 的事件回调
//         if (this.slot) {
//             this.slot.setOnThirdReelStartCallback(() => {
//                 this.canStop = true;
//                 this.updateSpinInteractable();
//                 console.log('[GameManager] 第三轴开始启动，现在可以使用即停功能');
//             });

//             this.slot.setOnSpinCompleteCallback((finalSymbols: SymbolType[]) => {
//                 this.onSpinComplete(finalSymbols);
//             });
//         }
//     }

//     private changeState(newState: GameState) {
//         if (this.gameState === newState) return;
//         console.log(`[GameManager] 状态变更: ${this.gameState} -> ${newState}`);
//         this.gameState = newState;
//         this.updateSpinInteractable();
//     }

//     public onConfirmPressed() {
//         console.log('[GameManager] 确认按钮被按下');
//         const parsed = this.parseEditBox();
//         this.customResult = parsed;
        
//         if (parsed) {
//             console.log('[GameManager] 自定义结果设置成功:', parsed);
//             this.showMessage('自订结果已设定！', 3);
//         } else {
//             console.log('[GameManager] 自定义结果解析失败或清空');
//             this.showMessage('输入格式错误或已清除自订结果', 3);
//         }
//     }

//     public async onSpinPressed() {
//         if (this.gameState === GameState.PROCESSING_RESULTS || 
//             this.gameState === GameState.PRESENTING) return;

//         if (this.gameState === GameState.SPINNING && this.canStop) {
//             console.log('[GameManager] 用户按下即停');
//             this.immediateStopRequested = true;
//             await this.stopSpin();
//         } else if (this.gameState === GameState.IDLE) {
//             this.cleanup();
//             await this.startSpin();
//         }
//     }

//     private async startSpin() {
//         console.log('[GameManager] 开始游戏');
//         this.resetGameState();
        
//         if (!this.slot) return;

//         // 决定最终符号：优先使用自定义结果
//         let finalSymbols: SymbolType[];
//         if (this.customResult && this.customResult.length === 9) {
//             finalSymbols = [...this.customResult];
//             console.log('[GameManager] 使用自定义结果:', finalSymbols);
//             // 使用后清除自定义结果
//             this.customResult = null;
//             if (this.editBox) {
//                 this.editBox.string = '';
//             }
//         } else {
//             finalSymbols = this.generateRandomSymbols();
//             console.log('[GameManager] 使用随机结果:', finalSymbols);
//         }

//         try {
//             await this.slot.startSpin(finalSymbols);
//         } catch (error) {
//             console.error('[GameManager] 开始旋转失败:', error);
//             this.handleError(error);
//         }
//     }

//     private async stopSpin() {
//         console.log('[GameManager] 开始停止旋转');
//         this.changeState(GameState.STOPPING);
        
//         if (!this.slot) return;

//         try {
//             await this.slot.stopSpin(this.immediateStopRequested);
//         } catch (error) {
//             console.error('[GameManager] 停止旋转失败:', error);
//             this.handleError(error);
//         }
//     }

//     private onSpinComplete(finalSymbols: SymbolType[]) {
//         console.log('[GameManager] 旋转完成，开始处理结果');
//         this.changeState(GameState.PROCESSING_RESULTS);
//         this.canStop = false;
//         this.processResultsAndPresentation(finalSymbols);
//     }

//     private cleanup() {
//         this.stopSingleLinePresentation();
//         this.abortPresentation();
        
//         if (this.ui) {
//             this.ui.clearLines();
//             this.ui.updateScore(0);
//             this.ui.showMessage('');
//         }
        
//         if (this.slot) {
//             this.slot.cleanup();
//         }
//     }

//     private resetGameState() {
//         this.canStop = false;
//         this.immediateStopRequested = false;
//         // 注意：这里不清除 customResult，让它在 startSpin 中使用后再清除
//         this.changeState(GameState.SPINNING);
//     }

//     // 以下是结果处理和展演相关代码（保持不变）
//     private lastWins: any[] = [];
//     private singleLineInterval: number | null = null;
//     private presentationAbortController: AbortController | null = null;

//     private async processResultsAndPresentation(finalSymbols: SymbolType[]) {
//         if (!finalSymbols || finalSymbols.length !== 9) return;

//         this.changeState(GameState.PRESENTING);

//         const { PaylineChecker } = await import('./PaylineChecker');
//         const wins = PaylineChecker.check(finalSymbols);
//         const totalScore = wins.reduce((sum: number, w: any) => sum + w.score, 0);
        
//         this.lastWins = [...wins];
//         this.ui?.updateScore(totalScore);

//         if (wins.length === 0) {
//             this.changeState(GameState.IDLE);
//             return;
//         }

//         this.presentationAbortController = new AbortController();
        
//         try {
//             await this.presentWins(wins);
//             this.changeState(GameState.IDLE);
//             this.startSingleLinePresentation();
//         } catch (error: any) {
//             if (error.name !== 'AbortError') {
//                 this.handleError(error);
//             }
//         }
//     }

//     private async presentWins(wins: any[]) {
//         if (!this.ui) return;

//         // 全线展演
//         this.ui.clearLines();
//         wins.forEach(w => this.ui!.showLine(w.lineIndex));

//         const flashPromises = wins.map(w => 
//             this.ui!.flashLineTwice(w.lineIndex).catch(() => {})
//         );

//         await Promise.race([
//             Promise.all(flashPromises),
//             this.sleep(1500)
//         ]);

//         // 检查中断
//         if (this.presentationAbortController?.signal.aborted) {
//             throw new Error('展演被中止');
//         }

//         // 单线轮播
//         if (wins.length > 1) {
//             for (const win of wins) {
//                 if (this.presentationAbortController?.signal.aborted) {
//                     throw new Error('展演被中止');
//                 }
                
//                 this.ui.clearLines();
//                 this.ui.showLine(win.lineIndex);
//                 await this.sleep(1000);
//             }

//             this.ui.clearLines();
//             wins.forEach(w => this.ui!.showLine(w.lineIndex));
//         }
//     }

//     private startSingleLinePresentation() {
//         if (!this.ui || this.lastWins.length === 0 || this.gameState !== GameState.IDLE) return;

//         this.stopSingleLinePresentation();

//         let currentIndex = 0;
//         const showNextLine = () => {
//             if (this.gameState !== GameState.IDLE) {
//                 this.stopSingleLinePresentation();
//                 return;
//             }

//             if (this.ui && this.lastWins.length > 0) {
//                 this.ui.clearLines();
//                 this.ui.showLine(this.lastWins[currentIndex].lineIndex);
//                 currentIndex = (currentIndex + 1) % this.lastWins.length;
//             }
//         };

//         showNextLine();
//         this.singleLineInterval = setInterval(showNextLine, 1000);
//     }

//     private stopSingleLinePresentation() {
//         if (this.singleLineInterval) {
//             clearInterval(this.singleLineInterval);
//             this.singleLineInterval = null;
//         }
//     }

//     private abortPresentation() {
//         if (this.presentationAbortController) {
//             this.presentationAbortController.abort();
//             this.presentationAbortController = null;
//         }
//     }

//     private parseEditBox(): SymbolType[] | null {
//         if (!this.editBox?.string?.trim()) {
//             console.log('[GameManager] EditBox 为空');
//             return null;
//         }

//         const inputString = this.editBox.string.trim();
//         console.log('[GameManager] 解析输入:', inputString);

//         // 支持多种分隔符：逗号、空格、竖线
//         const parts = inputString.split(/[,|\s]+/).map(s => s.trim()).filter(Boolean);
//         console.log('[GameManager] 分割后的部分:', parts);

//         if (parts.length !== 9) {
//             console.warn(`[GameManager] 符号数量错误: 期望9个，实际${parts.length}个`);
//             return null;
//         }

//         const symbols: SymbolType[] = [];
//         for (let i = 0; i < parts.length; i++) {
//             const part = parts[i];
//             const symbol = part.toUpperCase() as SymbolType;
            
//             if (!SymbolNames.includes(symbol)) {
//                 console.warn(`[GameManager] 第${i+1}个符号无效: "${part}" -> "${symbol}"`);
//                 console.log('[GameManager] 有效符号:', SymbolNames);
//                 return null;
//             }
//             symbols.push(symbol);
//         }
        
//         console.log('[GameManager] 解析成功:', symbols);
//         return symbols;
//     }

//     private generateRandomSymbols(): SymbolType[] {
//         return Array.from({length: 9}, () => 
//             SymbolNames[Math.floor(Math.random() * SymbolNames.length)]
//         );
//     }

//     private updateSpinInteractable() {
//         console.log(`[GameManager] 更新按钮状态 - 游戏状态: ${this.gameState}, canStop: ${this.canStop}`);
        
//         if (this.spinButton) {
//             const canInteract = this.gameState === GameState.IDLE || 
//                               (this.gameState === GameState.SPINNING && this.canStop);
//             this.spinButton.interactable = canInteract;
//             console.log(`[GameManager] 按钮可交互: ${canInteract}`);
//         }

//         if (this.spinButtonLabel) {
//             let buttonText = "SPIN";
            
//             switch (this.gameState) {
//                 case GameState.IDLE:
//                     buttonText = "SPIN";
//                     break;
//                 case GameState.SPINNING:
//                     buttonText = this.canStop ? "STOP" : "Waiting";
//                     break;
//                 case GameState.STOPPING:
//                 case GameState.PROCESSING_RESULTS:
//                 case GameState.PRESENTING:
//                     buttonText = "SPIN";
//                     break;
//             }
            
//             this.spinButtonLabel.string = buttonText;
//             console.log(`[GameManager] 按钮文字设置为: ${buttonText}`);
//         }
//     }

//     private showMessage(message: string, duration?: number) {
//         if (this.ui) {
//             this.ui.showMessage(message);
//             if (duration) {
//                 this.scheduleOnce(() => this.ui?.showMessage(''), duration);
//             }
//         }
//     }

//     private handleError = (error: any) => {
//         console.error('[GameManager] Error:', error);
//         this.cleanup();
//         this.changeState(GameState.IDLE);
//         this.showMessage('游戏发生错误，已重置', 3);
//     }

//     private sleep(ms: number): Promise<void> {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     onDestroy() {
//         this.cleanup();
//         this.abortPresentation();
//     }
// }
