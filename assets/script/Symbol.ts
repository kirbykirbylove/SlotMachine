// Symbol.ts
import { _decorator, Component, Sprite, SpriteFrame } from 'cc';
import { SymbolType, SymbolNames } from './SymbolConfig';

const { ccclass, property } = _decorator;

@ccclass('Symbol')
export class Symbol extends Component {
    @property(Sprite)
    public sprite: Sprite | null = null;
    @property([SpriteFrame])
    public symbolFrames: SpriteFrame[] = [];

    private currentSymbol: SymbolType = SymbolType.A;

    start() {
        // 如果沒有指定 sprite，嘗試從當前節點獲取
        if (!this.sprite) {
            this.sprite = this.getComponent(Sprite);
        }
        
        if (!this.sprite) {
            console.warn(`[Symbol ${this.node.name}] 未找到 Sprite 元件`);
        }
    }

    // 設定符號類型並更新顯示
    public setSymbol(symbol: SymbolType) {
        if (!SymbolNames.includes(symbol)) {
            console.warn(`[Symbol ${this.node.name}] 無效符號: ${symbol}`);
            return;
        }

        this.currentSymbol = symbol;
        this.updateDisplay();
    }

    // 取得目前符號
    public getSymbol(): SymbolType {
        return this.currentSymbol;
    }

    // 設定符號貼圖陣列
    public setSymbolFrames(frames: SpriteFrame[]) {
        this.symbolFrames = frames;
        this.updateDisplay();
    }

    // 更新顯示
    private updateDisplay() {
        if (!this.sprite || !this.currentSymbol) return;

        const symbolIndex = SymbolNames.indexOf(this.currentSymbol);
        if (symbolIndex >= 0 && this.symbolFrames[symbolIndex]) {
            try {
                this.sprite.spriteFrame = this.symbolFrames[symbolIndex];
            } catch (e) {
                console.warn(`[Symbol ${this.node.name}] 設定 SpriteFrame 失敗:`, e);
            }
        } else {
            console.warn(`[Symbol ${this.node.name}] 找不到符號 ${this.currentSymbol} 的 SpriteFrame`);
        }
    }

    // 設定透明度
    public setOpacity(opacity: number) {
        if (this.sprite) {
            this.sprite.node.opacity = opacity;
        }
    }

    // 設定是否啟用
    public setActive(active: boolean) {
        this.node.active = active;
    }

    // 播放符號變化動畫（可擴充）
    public playChangeAnimation(newSymbol: SymbolType, callback?: () => void) {
        // 這裡可以添加切換動畫，例如淡入淡出
        // 目前直接切換
        this.setSymbol(newSymbol);
        if (callback) {
            callback();
        }
    }
}
