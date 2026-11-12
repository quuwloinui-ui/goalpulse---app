import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../data/models/match.dart';

/// Plays one admin-curated source:
///   HLS      -> native player (video_player + Chewie controls, fullscreen, live mode)
///   WEBVIEW  -> embedded page, with top-level navigations to other hosts blocked
/// Give it a ValueKey(link.id) so switching sources creates a fresh player.
class StreamPlayer extends StatelessWidget {
  const StreamPlayer({super.key, required this.link});

  final StreamLink link;

  @override
  Widget build(BuildContext context) {
    final secure = link.url.toLowerCase().startsWith('https://');
    return ColoredBox(
      color: Colors.black,
      child: !secure
          ? Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text(context.tr('stream_blocked'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
              ),
            )
          : (link.isHls ? _HlsPlayer(url: link.url) : _WebPlayer(url: link.url)),
    );
  }
}

class _HlsPlayer extends StatefulWidget {
  const _HlsPlayer({required this.url});

  final String url;

  @override
  State<_HlsPlayer> createState() => _HlsPlayerState();
}

class _HlsPlayerState extends State<_HlsPlayer> {
  VideoPlayerController? _video;
  ChewieController? _chewie;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final video = VideoPlayerController.networkUrl(
      Uri.parse(widget.url),
      formatHint: VideoFormat.hls,
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: false),
    );
    try {
      await video.initialize();
      if (!mounted) {
        await video.dispose();
        return;
      }
      setState(() {
        _video = video;
        _chewie = ChewieController(
          videoPlayerController: video,
          autoPlay: true,
          isLive: true,
          aspectRatio: video.value.aspectRatio == 0 ? 16 / 9 : video.value.aspectRatio,
          allowFullScreen: true,
          allowMuting: true,
          errorBuilder: (context, message) => Center(
            child: Padding(padding: const EdgeInsets.all(16), child: Text(message, style: const TextStyle(color: Colors.white))),
          ),
        );
      });
    } catch (e) {
      await video.dispose();
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text(context.tr('stream_failed'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
        ),
      );
    }
    final chewie = _chewie;
    if (chewie == null) return const Center(child: CircularProgressIndicator());
    return Chewie(controller: chewie);
  }
}

class _WebPlayer extends StatefulWidget {
  const _WebPlayer({required this.url});

  final String url;

  @override
  State<_WebPlayer> createState() => _WebPlayerState();
}

class _WebPlayerState extends State<_WebPlayer> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    final host = Uri.parse(widget.url).host;
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
        // Embedded sub-frames may load anything; the *page itself* may not be redirected
        // to another site (pop-under ads, hijacks).
        onNavigationRequest: (request) {
          if (!request.isMainFrame) return NavigationDecision.navigate;
          final h = Uri.tryParse(request.url)?.host ?? '';
          final sameSite = h == host || h.endsWith('.$host') || request.url == 'about:blank';
          return sameSite ? NavigationDecision.navigate : NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        WebViewWidget(controller: _controller),
        if (_loading) const Center(child: CircularProgressIndicator()),
      ],
    );
  }
}
