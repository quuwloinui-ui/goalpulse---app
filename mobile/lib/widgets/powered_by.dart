import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Attribution required by SportScore's free tier ("Powered by SportScore" linking to sportscore.com).
/// It is mounted once in MaterialApp.builder (see app.dart), so it is visible on every screen.
class PoweredBySportScore extends StatelessWidget {
  const PoweredBySportScore({super.key});

  static final Uri _url = Uri.parse('https://sportscore.com/');

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      child: SafeArea(
        top: false,
        child: InkWell(
          onTap: () => launchUrl(_url, mode: LaunchMode.externalApplication),
          child: SizedBox(
            height: 22,
            width: double.infinity,
            child: Center(
              child: Text(
                'Powered by SportScore',
                textDirection: TextDirection.ltr,
                style: TextStyle(fontSize: 11, color: scheme.onSurface.withOpacity(0.6), decoration: TextDecoration.underline),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
