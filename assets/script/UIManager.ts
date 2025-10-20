// UIManager.ts
import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
  @property(Label)
  public scoreLabel: Label = null!;

  @property(Node)
  public lineContainer: Node = null!; // 5 條 line

  @property(Label)
  public messageLabel: Label = null!;

  start() {
    // 初始化時隱藏所有連線
    this.clearLines();
    this.updateScore(0);
  }

  // 更新分數
  public updateScore(v: number) {
    if (this.scoreLabel)
      this.scoreLabel.node.setSiblingIndex(-1);
      this.scoreLabel.string = `WIN\n\n${v}`;
  }

  public clearLines() {
    if (!this.lineContainer) return;
    this.lineContainer.children.forEach(c => c.active = false);
  }

  public showLine(index: number) {
    if (!this.lineContainer || index < 0 || index >= this.lineContainer.children.length) return;
    const node = this.lineContainer.children[index];
    if (node) node.active = true;
  }

  public async flashLineTwice(index: number): Promise<void> {
    if (!this.lineContainer || index < 0 || index >= this.lineContainer.children.length) return;
    const node = this.lineContainer.children[index];
    if (!node) return;
    
    // 確保節點初始狀態
    node.active = true;
    node.opacity = 255;
    
    // 閃爍兩下：顯示 -> 隱藏 -> 顯示 -> 隱藏 -> 顯示
    const flashDuration = 200; // 每次閃爍持續時間
    
    // 第一次閃爍
    await this.sleep(flashDuration);
    node.active = false;
    await this.sleep(flashDuration);
    node.active = true;
    
    // 第二次閃爍
    await this.sleep(flashDuration);
    node.active = false;
    await this.sleep(flashDuration);
    node.active = true;
  }

  public showMessage(s: string) {
    if (this.messageLabel) this.messageLabel.string = s;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}