import SwiftUI

/// Full Game unlock sheet. Copy/art/offer come from server-driven PAYWALL config; the price is
/// always StoreKit's localized displayPrice for the offered product.
struct PaywallView: View {
    @EnvironmentObject private var model: GameModel
    @EnvironmentObject private var store: StoreManager
    @Environment(\.dismiss) private var dismiss
    let placement: String

    private var config: PaywallConfig { model.paywallConfig }
    private var productID: String { model.offeredFullGame }

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                art
                    .frame(width: geo.size.width * 0.38)
                    .clipped()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(config.title)
                            .font(.system(.title, design: .serif).weight(.semibold))
                        if !config.subtitle.isEmpty {
                            Text(config.subtitle).font(.headline).foregroundStyle(.secondary)
                        }
                        if !config.body.isEmpty {
                            Text(config.body).font(.callout)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(config.bullets, id: \.self) { b in
                                Label(b, systemImage: "checkmark.seal.fill")
                                    .font(.callout)
                                    .symbolRenderingMode(.hierarchical)
                            }
                        }
                        purchaseButton
                        HStack(spacing: 18) {
                            Button("Restore Purchases") { Task { await store.restore(); if store.entitlements.full { dismiss() } } }
                            Button("Not Now") { dismiss() }
                        }
                        .font(.callout)
                        .disabled(store.busy)
                        HStack(spacing: 12) {
                            Link("Terms of Use", destination: URL(string: "https://grepawk.com/high-priestess/terms")!)
                            Link("Privacy Policy", destination: URL(string: "https://grepawk.com/high-priestess/privacy")!)
                        }
                        .font(.footnote)
                        Text("One-time purchase. Prologue and region 1 stay free. Shared with Family Sharing.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .preferredColorScheme(.dark)
        .background(Color("LaunchBackground"))
        .alert(store.message ?? "", isPresented: Binding(get: { store.message != nil }, set: { if !$0 { store.message = nil } })) {
            Button("OK", role: .cancel) {}
        }
        .onChange(of: store.entitlements.full) { _, full in if full { dismiss() } }
        .accessibilityIdentifier("paywall")
    }

    @ViewBuilder private var art: some View {
        if let img = UIImage(contentsOfFile: WebBundle.root.appendingPathComponent(config.art).path) {
            Image(uiImage: img).resizable().scaledToFill()
                .overlay(LinearGradient(colors: [.clear, Color("LaunchBackground")], startPoint: .center, endPoint: .trailing))
        } else {
            Color("LaunchBackground")
        }
    }

    private var priceText: String? {
        store.displayPrice(productID) ?? (model.paywallDemo ? "$4.99" : nil)
    }

    private var purchaseButton: some View {
        Button {
            Task { await model.purchaseFullGame(placement: placement) }
        } label: {
            HStack {
                if store.busy { ProgressView().tint(.black) }
                Text(priceText.map { "\(config.cta) · \($0)" } ?? config.cta)
                    .font(.headline)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color(red: 0.86, green: 0.70, blue: 0.38))
        .foregroundStyle(.black)
        .disabled(store.busy || (priceText == nil))
        .accessibilityIdentifier("buyFullGame")
        .overlay(alignment: .bottom) {
            if priceText == nil {
                Text("Connecting to the App Store…").font(.caption2).foregroundStyle(.secondary).offset(y: 18)
            }
        }
        .padding(.vertical, 6)
    }
}
