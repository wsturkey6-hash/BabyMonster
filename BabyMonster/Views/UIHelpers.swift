import SwiftUI

extension View {
    /// 讓表單能收起鍵盤：往下滑即收，鍵盤上方另外給一個「完成」按鈕。
    ///
    /// 原本是用 `simultaneousGesture(TapGesture())` 做「點空白處收鍵盤」，
    /// 但那個手勢會把 SwiftUI 選單的呈現一起吃掉 —— Form 裡所有 `.menu`
    /// 樣式的 Picker（大便量、大便形狀、睡眠、性別）點下去都毫無反應。
    /// 改用這兩個機制，收鍵盤照樣有效，且不攔截任何控制項的點擊。
    func keyboardDismissable() -> some View {
        self
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("完成") {
                        UIApplication.shared.sendAction(
                            #selector(UIResponder.resignFirstResponder),
                            to: nil, from: nil, for: nil)
                    }
                }
            }
    }
}

/// 短暫彈出提示
struct Toast: Equatable {
    var text: String
    var duration: TimeInterval = 1.0
}

private struct ToastModifier: ViewModifier {
    @Binding var toast: Toast?

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let toast {
                Text(toast.text)
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(radius: 4)
                    .padding(.bottom, 24)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(toast.duration))
                        withAnimation(.easeInOut(duration: 0.2)) { self.toast = nil }
                    }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: toast)
    }
}

extension View {
    func toast(_ toast: Binding<Toast?>) -> some View {
        modifier(ToastModifier(toast: toast))
    }
}
