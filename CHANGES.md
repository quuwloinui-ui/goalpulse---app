# Change report

## SportScore integration (latest)
- New default provider `sportscore` (no key): `backend/src/providers/sportscore.provider.js`, `sportscore.normalize.js`, `backend/test/sportscore.test.js` (10 tests built from real captured rows; 50 tests pass in total)
- `providers/index.js`, `config/env.js` (default provider, `SPORTSCORE_*`), `services/football.service.js` (provider hooks for filtering, tag and featured leagues), `.env.example`, `render.yaml` (no key prompt), README section 12
- Mobile: `widgets/powered_by.dart` + `app.dart`: "Powered by SportScore" under every screen
- Not verified yet (no real sample): in-play status wording, match details, standings, top scorers (tolerant parsers; see README 12)

Files added and modified in this update, compared with the previous delivery.

## Added (12)
- `.github/workflows/sportscore-probe.yml`: manual workflow that runs the probe and publishes the result
- `backend/public/privacy.html`: bilingual privacy policy page served at /privacy
- `backend/scripts/sportscore-probe.js`: schema-agnostic probe of the documented SportScore endpoints
- `backend/src/lib/budget.js`: hard daily request cap shared by all instances
- `backend/test/features.test.js`
- `mobile/lib/data/models/news.dart`
- `mobile/lib/features/account/account_screen.dart`: sign in, create account, sign out, delete account
- `mobile/lib/features/news/news_screen.dart`: News list and article page
- `mobile/lib/l10n/strings.dart`: 136 English/Arabic strings, translate helper
- `mobile/lib/providers/account_provider.dart`
- `mobile/lib/providers/news_providers.dart`
- `mobile/lib/providers/settings_providers.dart`

## Modified (38)
- `README.md`
- `backend/.env.example`
- `backend/prisma/schema.prisma`: User.email and User.passwordHash
- `backend/public/admin/app.js`: News tab in the admin panel
- `backend/public/admin/styles.css`
- `backend/scripts/smoke.js`
- `backend/src/app.js`
- `backend/src/config/env.js`
- `backend/src/providers/apiFootball.provider.js`
- `backend/src/providers/index.js`
- `backend/src/routes/index.js`
- `backend/src/routes/user.routes.js`: register, login, GET/DELETE /me (account deletion)
- `backend/src/services/liveUpdater.js`: starting-soon reminders; 60 s default cadence
- `backend/src/services/push.service.js`
- `backend/src/services/pushMessages.js`: English/Arabic push text, reminder text, language-scoped FCM conditions
- `backend/test/helpers.js`
- `mobile/lib/app.dart`: locale + RTL delegates, 12/24 h preference
- `mobile/lib/core/api_client.dart`
- `mobile/lib/core/config.dart`
- `mobile/lib/core/format.dart`
- `mobile/lib/core/push_service.dart`: per-type topics, language topic, reminder topics
- `mobile/lib/data/football_repository.dart`
- `mobile/lib/features/favorites/favorites_screen.dart`
- `mobile/lib/features/home/date_strip.dart`
- `mobile/lib/features/home/home_screen.dart`
- `mobile/lib/features/home/match_card.dart`
- `mobile/lib/features/match_details/lineups_tab.dart`
- `mobile/lib/features/match_details/match_details_screen.dart`
- `mobile/lib/features/match_details/overview_tab.dart`
- `mobile/lib/features/match_details/stats_tab.dart`
- `mobile/lib/features/match_details/stream_player.dart`
- `mobile/lib/features/match_details/streams_tab.dart`
- `mobile/lib/features/settings/settings_screen.dart`: language, theme, time format, notifications, account, share, rate, privacy, Facebook
- `mobile/lib/features/shell/main_shell.dart`: five tabs (News hidden by the feature flag)
- `mobile/lib/features/standings/standings_screen.dart`
- `mobile/lib/providers/favorites_provider.dart`
- `mobile/lib/widgets/common.dart`
- `mobile/pubspec.yaml`: flutter_localizations, share_plus

## Not changed on purpose
No existing feature was removed. API-Football and the mock provider still work (set `FOOTBALL_PROVIDER`).
