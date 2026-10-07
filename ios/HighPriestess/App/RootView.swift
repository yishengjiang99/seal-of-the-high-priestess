import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: GameModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color("LaunchBackground").ignoresSafeArea()
            GameWebView(webView: model.webView)
                .ignoresSafeArea()
                .opacity(model.webReady ? 1 : 0)
            if !model.webReady {
                VStack(spacing: 12) {
                    ProgressView().tint(.white)
                    Text("Temple of the High Priestess")
                        .font(.system(.headline, design: .serif))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Button {
                model.showSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 32, height: 32)
                    .background(.black.opacity(0.35), in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Settings")
            .accessibilityIdentifier("settingsButton")
            .padding(.leading, 2)
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .defersSystemGestures(on: .all)
        .sheet(isPresented: $model.showSettings) {
            SettingsView().environmentObject(model).environmentObject(model.storeKit)
        }
        .fullScreenCover(item: $model.paywall) { req in
            PaywallView(placement: req.placement)
                .environmentObject(model)
                .environmentObject(model.storeKit)
        }
        .sheet(item: $model.activeConflict) { conflict in
            ConflictView(conflict: conflict).environmentObject(model)
                .interactiveDismissDisabled()
        }
    }
}
