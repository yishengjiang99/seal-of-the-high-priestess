import XCTest
@testable import HighPriestess

final class GameCenterRuleTests: XCTestCase {
    private var config: GameCenterManager.Config!

    override func setUpWithError() throws {
        config = try XCTUnwrap(GameCenterManager.loadConfig(), "gamecenter.json must be bundled in the app")
    }

    func testBundledConfigShape() {
        XCTAssertEqual(config.achievements.count, 14)
        XCTAssertEqual(config.achievements.map(\.points).reduce(0, +), 630)
        XCTAssertEqual(config.leaderboards.count, 5)
        XCTAssertEqual(Set(config.achievements.map(\.id)).count, config.achievements.count)
        XCTAssertTrue(config.achievements.allSatisfy { $0.id.hasPrefix("soth.ach.") })
        XCTAssertTrue(config.leaderboards.allSatisfy { $0.id.hasPrefix("soth.lb.boss.") })
    }

    func testEarnedByFlags() {
        let ids = GameCenterManager.earned(byFlags: ["tut_wisp", "hollow_oak_dead", "unrelated"], config: config)
        XCTAssertEqual(Set(ids), ["soth.ach.first_light", "soth.ach.heartwood"])
        let quests: Set<String> = ["quest_acolyte_found", "quest_shen", "quest_canal", "quest_blacksmith",
                                   "quest_letter", "quest_lantern", "quest_tablet"]
        XCTAssertFalse(GameCenterManager.earned(byFlags: quests, config: config).contains("soth.ach.keeper_of_promises"))
        XCTAssertTrue(GameCenterManager.earned(byFlags: quests.union(["quest_hound"]), config: config).contains("soth.ach.keeper_of_promises"))
    }

    func testEarnedByBattle() {
        typealias R = GameCenterManager.BattleResult
        var ids = GameCenterManager.earned(byBattle: R(id: "hollow_oak", boss: "hollow_oak", ms: 120_000), config: config)
        XCTAssertEqual(Set(ids), ["soth.ach.swift_purification", "soth.ach.untouched"])
        ids = GameCenterManager.earned(byBattle: R(id: "hollow_oak", boss: "hollow_oak", ms: 200_000, fallen: 1), config: config)
        XCTAssertTrue(ids.isEmpty)
        ids = GameCenterManager.earned(byBattle: R(id: "wolves", ms: 30_000, unsealed: true), config: config)
        XCTAssertEqual(ids, ["soth.ach.break_the_seal"]) // flawless needs a boss
        ids = GameCenterManager.earned(byBattle: R(id: "canal_specter", boss: "canal_specter", ms: 400_000, fallen: 2), config: config)
        XCTAssertEqual(ids, ["soth.ach.childs_shoe"])
    }

    func testBossTimeScore() {
        typealias R = GameCenterManager.BattleResult
        let s = GameCenterManager.score(for: R(id: "gate_warden", boss: "gate_warden", ms: 95_432), config: config)
        XCTAssertEqual(s?.0, "soth.lb.boss.gate_warden")
        XCTAssertEqual(s?.1, 9_543) // hundredths of a second
        XCTAssertNil(GameCenterManager.score(for: R(id: "wolves", ms: 50_000), config: config))
        XCTAssertNil(GameCenterManager.score(for: R(id: "gate_warden", boss: "gate_warden", ms: 2_000), config: config))
        XCTAssertNil(GameCenterManager.score(for: R(id: "gate_warden", boss: "gate_warden", ms: 4_000_000), config: config))
    }

    func testBattleResultFromBridge() {
        let r = GameCenterManager.BattleResult(["id": "bound_hound", "boss": "bound_hound", "ms": 61_000.0, "unsealed": true, "fallen": 0])
        XCTAssertEqual(r, GameCenterManager.BattleResult(id: "bound_hound", boss: "bound_hound", ms: 61_000, unsealed: true, fallen: 0))
        XCTAssertNil(GameCenterManager.BattleResult(["ms": 5]))
    }

    func testTruthy() {
        XCTAssertTrue(GameModel.truthy(true))
        XCTAssertTrue(GameModel.truthy(NSNumber(value: 1)))
        XCTAssertTrue(GameModel.truthy("yes"))
        XCTAssertFalse(GameModel.truthy(false))
        XCTAssertFalse(GameModel.truthy(NSNumber(value: 0)))
        XCTAssertFalse(GameModel.truthy(nil))
        XCTAssertFalse(GameModel.truthy(NSNull()))
    }
}

final class SaveSummaryTests: XCTestCase {
    func testSummaryFromGameSave() {
        let json = """
        {"flags":{"hollow_oak_dead":true,"lyra_joined":1,"warden_dead":false},"quests":{"quest_shen":"done","quest_canal":"active","quest_letter":"done"},
         "party":["elara","kael","lyra"],"mapId":"canal_district","when":1760000000000}
        """
        let s = SaveSummary(json: json)
        XCTAssertFalse(s.empty)
        XCTAssertEqual(s.chapter, 2)
        XCTAssertEqual(s.questsDone, 2)
        XCTAssertEqual(s.party, ["elara", "kael", "lyra"])
        XCTAssertEqual(s.progressText, "Chapter 3 of 7 · 2 quests done")
        XCTAssertEqual(s.partyText, "Elara, Kael, Lyra")
        XCTAssertEqual(s.when, Date(timeIntervalSince1970: 1_760_000_000))
        XCTAssertGreaterThan(s.progressScore, SaveSummary(json: #"{"flags":{"hollow_oak_dead":true}}"#).progressScore)
        XCTAssertEqual(s.dictionary["chapter"] as? Int, 2)
        XCTAssertTrue(SaveSummary(json: nil).empty)
        XCTAssertTrue(SaveSummary(json: "not json").empty)
    }
}
