# Seal iOS scope v2 (from Yisheng via Chief of Staff, Oct 6 2026 23:29 PT)
Supersedes "keep content small". Fully functional iOS app, server-driven content, optimized IAP. No PRs: push to main.

## IAP (CoS decision; deviate only with logged reason in DECISIONS.md)
- Free download; prologue + region 1 free. Non-consumable "Full Game" unlock is core.
- Launch price test via server config choosing which Full Game product ID to offer (e.g. $4.99 vs $6.99 tiers); offer codes + launch promo.
- Optional non-consumable "Supporter Pack" (cosmetic: alt portraits/outfits, soundtrack/voice gallery), zero gameplay advantage.
- No subscriptions, no pay-to-win consumables, no loot boxes.
- StoreKit 2 + .storekit config for tests. Server-side verification via App Store Server API; store signed transactions with account/save. App Store Server Notifications v2 (refund => revoke). Restore Purchases, Family Sharing on.
- Paywall at end-of-region-1 cliffhanger + soft upsell in menu. Paywall copy/art/placement/offered SKU server-driven; prices NOT server-driven.
- First-party funnel events only (paywall_shown, purchase, restore, region_complete) to temple-api; no third-party SDK. Update privacy page, App Privacy, PrivacyInfo.xcprivacy (purchases + gameplay identifier).
- Create IAP products + review screenshots via ASC API. If Paid Apps Agreement / tax / banking blocks it: ship with StoreKit testing and flag to Chief of Staff (not the user).

## Server-driven content (full)
- Versioned, signed content bundles (dialogue, quests, balance, events, paywall config, feature flags) with bundled fallback.
- Admin endpoint/CLI to publish and roll back.
- App Review 2.5.2: data/config only; engine JS ships in bundle; no downloaded behavior-changing JS.

## Backlog after first TestFlight build VALID (rough order)
1. Game Center achievements + leaderboards (boss times)
2. iCloud + server save conflict UX
3. Controller/keyboard polish
4. Accessibility: Dynamic Type (native UI), VoiceOver menus, subtitle size, colorblind-safe cues, reduce motion
5. Localization-ready strings
6. Performance: 60fps iPhone 12, memory, cold start <2s, audio preloading
7. Crash/hang telemetry (MetricKit, first party)
8. Opt-in push for re-engagement (events only)
9. Listing: landscape screenshots iPhone 6.9" + iPad 13", app preview video, ASO keywords
10. Onboarding/tutorial
11. Settings: volume, text speed, haptics toggle
12. Admin dashboard for funnel + IAP metrics at grepawk.com

## Reporting
On each milestone or when backlog runs dry: message Chief of Staff (priority true) with what's live, what's VALID on TestFlight, and next steps.
