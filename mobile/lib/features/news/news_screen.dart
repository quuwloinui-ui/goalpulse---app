import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme.dart';
import '../../data/models/news.dart';
import '../../l10n/strings.dart';
import '../../providers/news_providers.dart';
import '../../widgets/common.dart';

class NewsScreen extends ConsumerWidget {
  const NewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final news = ref.watch(newsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('news'))),
      body: news.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(newsProvider)),
        data: (list) => RefreshIndicator(
          onRefresh: () async => ref.refresh(newsProvider.future),
          child: list.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    const SizedBox(height: 120),
                    EmptyState(icon: Icons.newspaper_outlined, message: context.tr('no_news')),
                  ],
                )
              : ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, i) => _NewsCard(article: list[i]),
                ),
        ),
      ),
    );
  }
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.article});

  final NewsArticle article;

  @override
  Widget build(BuildContext context) {
    final image = article.imageUrl;
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: context.surfaceCard,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => NewsDetailScreen(article: article))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (image != null && image.isNotEmpty)
              AspectRatio(
                aspectRatio: 16 / 9,
                child: CachedNetworkImage(
                  imageUrl: image,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => const ColoredBox(color: Colors.black12),
                  errorWidget: (_, __, ___) => const ColoredBox(color: Colors.black12),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(article.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, height: 1.3)),
                  if (article.summary != null && article.summary!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(article.summary!, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(color: context.mutedText, height: 1.4)),
                  ],
                  const SizedBox(height: 8),
                  Text(DateFormat.yMMMd().format(article.publishedAt), style: TextStyle(fontSize: 12, color: context.mutedText)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class NewsDetailScreen extends StatelessWidget {
  const NewsDetailScreen({super.key, required this.article});

  final NewsArticle article;

  @override
  Widget build(BuildContext context) {
    final image = article.imageUrl;
    final source = article.sourceUrl;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('news'))),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          if (image != null && image.isNotEmpty)
            AspectRatio(
              aspectRatio: 16 / 9,
              child: CachedNetworkImage(imageUrl: image, fit: BoxFit.cover, errorWidget: (_, __, ___) => const ColoredBox(color: Colors.black12)),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(article.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, height: 1.25)),
                const SizedBox(height: 8),
                Text(DateFormat.yMMMEd().format(article.publishedAt), style: TextStyle(fontSize: 12.5, color: context.mutedText)),
                if (article.summary != null && article.summary!.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text(article.summary!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.5)),
                ],
                if (article.body != null && article.body!.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  SelectableText(article.body!, style: const TextStyle(fontSize: 15.5, height: 1.65)),
                ],
                if (source != null && source.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  OutlinedButton.icon(
                    onPressed: () => launchUrl(Uri.parse(source), mode: LaunchMode.externalApplication),
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: Text(context.tr('read_source')),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
