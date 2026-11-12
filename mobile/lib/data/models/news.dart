import 'json.dart';

class NewsArticle {
  const NewsArticle({required this.id, required this.title, this.summary, this.body, this.imageUrl, this.sourceUrl, required this.publishedAt});

  final int id;
  final String title;
  final String? summary;
  final String? body;
  final String? imageUrl;
  final String? sourceUrl;
  final DateTime publishedAt;

  factory NewsArticle.fromJson(Map<String, dynamic> j) => NewsArticle(
        id: toInt(j['id']),
        title: (j['title'] ?? '') as String,
        summary: j['summary'] as String?,
        body: j['body'] as String?,
        imageUrl: j['imageUrl'] as String?,
        sourceUrl: j['sourceUrl'] as String?,
        publishedAt: DateTime.tryParse('${j['publishedAt']}')?.toLocal() ?? DateTime.now(),
      );
}
