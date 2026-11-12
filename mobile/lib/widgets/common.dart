import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../l10n/strings.dart';

/// Network image with a quiet placeholder / fallback icon (team logos, league logos, photos).
class NetImage extends StatelessWidget {
  const NetImage(this.url, {super.key, this.size = 32, this.fallback = Icons.shield_outlined, this.circle = false});

  final String? url;
  final double size;
  final IconData fallback;
  final bool circle;

  @override
  Widget build(BuildContext context) {
    final placeholder = SizedBox(
      width: size,
      height: size,
      child: Icon(fallback, size: size * 0.7, color: Theme.of(context).hintColor),
    );
    final u = url;
    if (u == null || u.isEmpty) return placeholder;
    final image = CachedNetworkImage(
      imageUrl: u,
      width: size,
      height: size,
      fit: BoxFit.contain,
      placeholder: (_, __) => SizedBox(width: size, height: size),
      errorWidget: (_, __, ___) => placeholder,
    );
    return circle ? ClipOval(child: image) : image;
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 44, color: Theme.of(context).hintColor),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor)),
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 44),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, maxLines: 3, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: onRetry, child: Text(context.tr('retry'))),
          ],
        ),
      ),
    );
  }
}
