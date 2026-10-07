import GameKit
import SwiftUI

/// Game Center: achievements + boss-time leaderboards. Definitions come from the bundled
/// gamecenter.json (the same file scripts/asc/game_center.py pushes to App Store Connect).
/// Earned achievements and best times are queued locally and reported once the player is signed
/// in, so nothing is lost offline or before sign-in. Game Center is optional: the sign-in sheet is
/// only shown when the player asks for it in Settings.
@MainActor
final class GameCenterManager: NSObject, ObservableObject {
    struct Trigger: Decodable, Equatable {
        var flag: String?
        var flagsAll: [String]?
        var battle: String?
        var maxMs: Int?
        var flawless: Bool?
        var unsealed: Bool?
        var boss: Bool?
    }
    struct Achievement: Decodable, Equatable { let id: String; let name: String; let points: Int; let hidden: Bool; let trigger: Trigger }
    struct Leaderboard: Decodable, Equatable { let id: String; let name: String; let boss: String }
    struct Defaults: Decodable { let rangeStart: Int; let rangeEnd: Int }
    struct Config: Decodable {
        let achievements: [Achievement]
        let leaderboards: [Leaderboard]
        let leaderboardDefaults: Defaults
    }
    struct BattleResult: Equatable {
        var id: String
        var boss: String?
        var ms: Int
        var unsealed: Bool
        var fallen: Int
        init(id: String, boss: String? = nil, ms: Int = 0, unsealed: Bool = false, fallen: Int = 0) {
            self.id = id; self.boss = boss; self.ms = ms; self.unsealed = unsealed; self.fallen = fallen
        }
        init?(_ d: [String: Any]?) {
            guard let d, let id = d["id"] as? String else { return nil }
            self.init(id: id, boss: d["boss"] as? String, ms: (d["ms"] as? NSNumber)?.intValue ?? 0,
                      unsealed: d["unsealed"] as? Bool ?? false, fallen: (d["fallen"] as? NSNumber)?.intValue ?? 0)
        }
    }

    nonisolated static func loadConfig(bundle: Bundle = .main) -> Config? {
        guard let url = bundle.url(forResource: "gamecenter", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Config.self, from: data)
    }

    // MARK: Pure rules (unit tested)

    nonisolated static func earned(byFlags flags: Set<String>, config: Config) -> [String] {
        config.achievements.filter { a in
            if let f = a.trigger.flag { return flags.contains(f) }
            if let all = a.trigger.flagsAll { return !all.isEmpty && Set(all).isSubset(of: flags) }
            return false
        }.map(\.id)
    }

    nonisolated static func earned(byBattle r: BattleResult, config: Config) -> [String] {
        config.achievements.filter { a in
            let t = a.trigger
            guard let b = t.battle, b == "*" || b == r.id else { return false }
            if t.boss == true, r.boss == nil { return false }
            if t.flawless == true, r.fallen > 0 { return false }
            if t.unsealed == true, !r.unsealed { return false }
            if let max = t.maxMs, !(r.ms > 0 && r.ms <= max) { return false }
            return true
        }.map(\.id)
    }

    /// Leaderboard id + score (hundredths of a second) for a boss win, if it is within the board's range.
    nonisolated static func score(for r: BattleResult, config: Config) -> (String, Int)? {
        guard let boss = r.boss, let lb = config.leaderboards.first(where: { $0.boss == boss }) else { return nil }
        let cs = r.ms / 10
        guard cs >= config.leaderboardDefaults.rangeStart, cs <= config.leaderboardDefaults.rangeEnd else { return nil }
        return (lb.id, cs)
    }

    // MARK: State

    @Published private(set) var authenticated = false
    @Published private(set) var playerName: String?
    @Published private(set) var canSignIn = false
    var enabled: Bool { defaults.object(forKey: "gameCenter") as? Bool ?? true }

    let config: Config?
    private var signInController: UIViewController?
    private let defaults = UserDefaults.standard

    private var flags: Set<String> {
        get { Set(defaults.stringArray(forKey: "gc.flags") ?? []) }
        set { defaults.set(Array(newValue), forKey: "gc.flags") }
    }
    private(set) var earnedIDs: Set<String> {
        get { Set(defaults.stringArray(forKey: "gc.earned") ?? []) }
        set { defaults.set(Array(newValue), forKey: "gc.earned") }
    }
    private var pending: Set<String> {
        get { Set(defaults.stringArray(forKey: "gc.pending") ?? []) }
        set { defaults.set(Array(newValue), forKey: "gc.pending") }
    }
    /// Best (lowest) unreported score per leaderboard.
    private var pendingScores: [String: Int] {
        get { defaults.dictionary(forKey: "gc.pendingScores") as? [String: Int] ?? [:] }
        set { defaults.set(newValue, forKey: "gc.pendingScores") }
    }

    override init() {
        config = Self.loadConfig()
        super.init()
    }

    /// Silent authentication at launch. If the player isn't signed in, the sign-in sheet is kept
    /// for Settings instead of interrupting the game.
    func authenticate() {
        guard config != nil else { return }
        GKLocalPlayer.local.authenticateHandler = { [weak self] vc, _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.signInController = vc
                self.canSignIn = vc != nil
                self.refresh()
            }
        }
    }

    func signIn() {
        if let vc = signInController { Self.present(vc) }
        else if !authenticated, let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }

    private func refresh() {
        let p = GKLocalPlayer.local
        authenticated = p.isAuthenticated
        playerName = p.isAuthenticated ? p.displayName : nil
        GKAccessPoint.shared.isActive = false
        if authenticated { Task { await flush() } }
    }

    // MARK: Game events

    func flag(_ k: String) {
        var f = flags
        guard !f.contains(k) else { return }
        f.insert(k)
        flags = f
        evaluateFlags()
    }

    /// Flags restored from a loaded save (no setFlag events for those).
    func progress(_ list: [String]) {
        let f = flags.union(list)
        guard f != flags else { return }
        flags = f
        evaluateFlags()
    }

    func battle(_ r: BattleResult) {
        guard let config else { return }
        earn(Self.earned(byBattle: r, config: config))
        if case let (id, score)? = Self.score(for: r, config: config) {
            var s = pendingScores
            s[id] = min(s[id] ?? Int.max, score)
            pendingScores = s
            Task { await flush() }
        }
    }

    private func evaluateFlags() {
        guard let config else { return }
        earn(Self.earned(byFlags: flags, config: config))
    }

    private func earn(_ ids: [String]) {
        let new = Set(ids).subtracting(earnedIDs)
        guard !new.isEmpty else { return }
        earnedIDs = earnedIDs.union(new)
        pending = pending.union(new)
        Task { await flush() }
    }

    func flush() async {
        guard enabled, GKLocalPlayer.local.isAuthenticated else { return }
        let ids = pending
        if !ids.isEmpty {
            let list = ids.map { id -> GKAchievement in
                let a = GKAchievement(identifier: id)
                a.percentComplete = 100
                a.showsCompletionBanner = true
                return a
            }
            do {
                try await GKAchievement.report(list)
                pending = pending.subtracting(ids)
            } catch {
                // keep queued; retried on next event / launch
            }
        }
        for (id, score) in pendingScores {
            do {
                try await GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id])
                var s = pendingScores
                if s[id] == score { s[id] = nil }
                pendingScores = s
            } catch {}
        }
    }

    // MARK: UI

    func showDashboard(_ state: GKGameCenterViewControllerState = .dashboard) {
        guard authenticated else { signIn(); return }
        let vc = GKGameCenterViewController(state: state)
        vc.gameCenterDelegate = self
        Self.present(vc)
    }

    static func present(_ vc: UIViewController) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController ?? scene?.windows.first?.rootViewController
        while let p = top?.presentedViewController { top = p }
        top?.present(vc, animated: true)
    }
}

extension GameCenterManager: GKGameCenterControllerDelegate {
    nonisolated func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        MainActor.assumeIsolated { gameCenterViewController.dismiss(animated: true) }
    }
}
