import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/models/remote_config.dart';

/// Admin-managed promotional banner (hidden entirely when the "ads" feature is off).
class BannerCard extends StatelessWidget {
  const BannerCard({super.key, required this.banner});

  final BannerItem banner;

  @override
  Widget build(BuildContext context) {
    final target = banner.targetUrl;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: target == null ? null : () => launchUrl(Uri.parse(target), mode: LaunchMode.externalApplication),
          child: AspectRatio(
            aspectRatio: 4,
            child: CachedNetworkImage(
              imageUrl: banner.imageUrl,
              fit: BoxFit.cover,
              placeholder: (_, __) => const ColoredBox(color: Colors.black12),
              errorWidget: (_, __, ___) => const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    );
  }
}
