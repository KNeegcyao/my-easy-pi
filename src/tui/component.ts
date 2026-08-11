// ============================================================
// Component / TUI / Focusable — TUI 框架的核心契约
//
// 设计参考 earendil-works/pi 的 packages/tui/src/tui.ts。
// 所有 UI 元素都实现 Component 接口；通过类型守卫 (isFocusable)
// 而非继承来混入焦点能力。
// ============================================================

/** 终端 UI 组件契约 */
export interface Component {
  /** 渲染成若干行字符串（已含 ANSI 转义序列）；宽度外的裁切由渲染器负责 */
  render(width: number): string[]
  /** 可选：处理键盘原始输入（如 ESC/console 序列） */
  handleInput?(data: string): void
  /** 可选：声明想收键释放事件（kitty 协议） */
  wantsKeyRelease?: boolean
  /** 失效内部缓存；下一次 render 必须重新计算 */
  invalidate(): void
}

/** 焦点能力（不强制继承，用 isFocusable 判定） */
export interface Focusable {
  readonly hasFocus: boolean
  focus(): void
  blur(): void
}

/** 类型守卫：判断组件是否可聚焦 */
export function isFocusable(c: Component): c is Component & Focusable {
  const anyC = c as unknown as Record<string, unknown>
  return (
    typeof anyC.focus === 'function' &&
    typeof anyC.blur === 'function' &&
    typeof anyC.hasFocus === 'boolean'
  )
}

/** Overlay（模态层）配置 */
export interface OverlayOptions {
  /** 是否让 overlay 捕获所有键盘输入（默认 true） */
  captureInput?: boolean
  /** 是否渲染半透明背景遮罩（默认 false） */
  backdrop?: boolean
}

/** Overlay 句柄，用于关闭 */
export interface OverlayHandle {
  close(): void
  readonly closed: boolean
}

/**
 * TUI 渲染器抽象。
 * 业务侧只与该接口交互；不了解它背后是主屏渲染还是 alt screen。
 */
export interface TUI {
  /** 注册顶层组件（等价于 addChild 到根 VStack） */
  registerComponent(c: Component): void
  /** 反注册 */
  unregisterComponent(c: Component): void

  /** 把组件钉在 top / bottom 边缘（仅 alt screen 有效；main screen 按顺序追加） */
  dock(position: 'top' | 'bottom', c: Component): void

  /** 设置主视口组件（alt screen 专用；main screen 等价于 registerComponent） */
  setMain(c: Component): void

  /** alt-screen 专用：挂布局树根（VStack）。main screen 可空实现。Phase 5。 */
  setLayoutRoot?(root: Component): void

  /** 触发一次重渲染（可以高频调用，渲染器内部去抖） */
  requestRender(): void

  /** 显示模态层；Overlay 独占焦点与输入 */
  showOverlay(c: Component, opts?: OverlayOptions): OverlayHandle
  closeOverlay(h: OverlayHandle): void

  /** 启动渲染循环（进入 raw mode、订阅输入） */
  start(): Promise<void> | void
  /** 停止渲染循环（恢复终端状态；alt screen 退出并回放 transcript） */
  stop(): Promise<void> | void
}
