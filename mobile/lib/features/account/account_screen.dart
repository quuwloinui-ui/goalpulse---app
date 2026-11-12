import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../l10n/strings.dart';
import '../../providers/account_provider.dart';

/// Sign in / create an account (keeps favourites across devices) and delete the account.
class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _createMode = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String _errorText(String code) {
    switch (code) {
      case 'ERR_CREDENTIALS':
        return context.tr('err_credentials');
      case 'ERR_TAKEN':
        return context.tr('err_taken');
      case 'ERR_INVALID':
        return context.tr('err_invalid');
      default:
        return code;
    }
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (!email.contains('@') || password.length < 8) {
      setState(() => _error = 'ERR_INVALID');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final notifier = ref.read(accountProvider.notifier);
    final err = _createMode ? await notifier.register(email, password) : await notifier.signIn(email, password);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) _password.clear();
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.tr('delete_title')),
        content: Text(ctx.tr('delete_body')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tr('cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(ctx.tr('delete')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    final err = await ref.read(accountProvider.notifier).deleteAccount();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.tr('done_deleted'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(accountProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('account'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (account.signedIn) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(context.tr('signed_in_as', {'email': account.email ?? ''}), style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => ref.read(accountProvider.notifier).signOut(),
              icon: const Icon(Icons.logout),
              label: Text(context.tr('sign_out')),
            ),
          ] else ...[
            Text(context.tr('anon_note'), style: TextStyle(color: context.mutedText, height: 1.5)),
            const SizedBox(height: 16),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: InputDecoration(labelText: context.tr('email'), border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(labelText: context.tr('password'), helperText: context.tr('password_hint'), border: const OutlineInputBorder()),
              onSubmitted: (_) => _busy ? null : _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_errorText(_error!), style: TextStyle(color: Colors.red.shade400, fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: _busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(context.tr(_createMode ? 'create_account' : 'sign_in')),
              ),
            ),
            TextButton(
              onPressed: _busy ? null : () => setState(() { _createMode = !_createMode; _error = null; }),
              child: Text(context.tr(_createMode ? 'have_account' : 'need_account')),
            ),
          ],
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade400, side: BorderSide(color: Colors.red.shade400)),
            onPressed: _busy ? null : _delete,
            icon: const Icon(Icons.delete_outline),
            label: Text(context.tr('delete_account')),
          ),
        ],
      ),
    );
  }
}
