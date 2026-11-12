import 'json.dart';

class BannerItem {
  const BannerItem({required this.id, required this.title, required this.imageUrl, this.targetUrl, required this.placement});

  final int id;
  final String title;
  final String imageUrl;
  final String? targetUrl;
  final String placement; // HOME_TOP | HOME_INLINE | MATCH_BOTTOM

  factory BannerItem.fromJson(Map<String, dynamic> j) => BannerItem(
        id: toInt(j['id']),
        title: (j['title'] ?? '') as String,
        imageUrl: (j['imageUrl'] ?? '') as String,
        targetUrl: j['targetUrl'] as String?,
        placement: (j['placement'] ?? 'HOME_TOP') as String,
      );
}

/// Admin-controlled switches and banners fetched from GET /config.
class RemoteConfig {
  const RemoteConfig({this.features = const {}, this.banners = const []});

  final Map<String, bool> features;
  final List<BannerItem> banners;

  factory RemoteConfig.fromJson(Map<String, dynamic> j) => RemoteConfig(
        features: {
          for (final e in asMap(j['features'] ?? const {}).entries)
            if (e.value is bool) e.key: e.value as bool,
        },
        banners: parseList(j['banners'], BannerItem.fromJson),
      );
}
