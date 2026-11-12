import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/strings.dart';
import '../../providers/app_providers.dart';
import '../../providers/match_providers.dart';
import '../favorites/favorites_screen.dart';
import '../home/home_screen.dart';
import '../news/news_screen.dart';
import '../settings/settings_screen.dart';
import '../standings/standings_screen.dart';

class MainShell extends ConsumerStatefulWidget {
  const MainShell({super.key});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final live = ref.watch(liveCountProvider);
    final newsOn = ref.watch(featuresProvider)['news'] ?? true; // admin can hide the tab
    final pages = <Widget>[
      const HomeScreen(),
      const StandingsScreen(),
      if (newsOn) const NewsScreen(),
      const FavoritesScreen(),
      const SettingsScreen(),
    ];
    final index = _index >= pages.length ? 0 : _index;

    return Scaffold(
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
            icon: Badge(label: Text('$live'), isLabelVisible: live > 0, child: const Icon(Icons.sports_soccer_outlined)),
            selectedIcon: Badge(label: Text('$live'), isLabelVisible: live > 0, child: const Icon(Icons.sports_soccer)),
            label: context.tr('nav_matches'),
          ),
          NavigationDestination(icon: const Icon(Icons.leaderboard_outlined), selectedIcon: const Icon(Icons.leaderboard), label: context.tr('nav_standings')),
          if (newsOn) NavigationDestination(icon: const Icon(Icons.newspaper_outlined), selectedIcon: const Icon(Icons.newspaper), label: context.tr('nav_news')),
          NavigationDestination(icon: const Icon(Icons.star_outline), selectedIcon: const Icon(Icons.star), label: context.tr('nav_favorites')),
          NavigationDestination(icon: const Icon(Icons.settings_outlined), selectedIcon: const Icon(Icons.settings), label: context.tr('nav_settings')),
        ],
      ),
    );
  }
}
