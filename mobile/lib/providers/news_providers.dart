import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/news.dart';
import 'app_providers.dart';

final newsProvider = FutureProvider.autoDispose<List<NewsArticle>>(
  (ref) => ref.watch(footballRepositoryProvider).news(),
);
