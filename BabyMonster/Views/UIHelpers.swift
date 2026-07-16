import SwiftUI

extension View {
    /// 點擊空白處收起鍵盤
    func dismissKeyboardOnTap() -> some View {
        simultaneousGesture(TapGesture().onEnded {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                            to: nil, from: nil, for: nil)
        })
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
