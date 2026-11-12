import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/storage.dart';
import '../data/models/json.dart';
import 'favorites_provider.dart';

class AccountState {
  const AccountState({this.email});

  final String? email;
  bool get signedIn => email != null;
}

/// Optional account on top of the anonymous device user. Methods return null on success or an
/// error code ("ERR_CREDENTIALS", "ERR_TAKEN", "ERR_INVALID") / server message on failure.
class AccountNotifier extends Notifier<AccountState> {
  static const _kEmail = 'account.email';

  @override
  AccountState build() => AccountState(email: ref.read(sharedPrefsProvider).getString(_kEmail));

  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> _setEmail(String? email) async {
    final prefs = ref.read(sharedPrefsProvider);
    if (email == null) {
      await prefs.remove(_kEmail);
    } else {
      await prefs.setString(_kEmail, email);
    }
    state = AccountState(email: email);
  }

  String _code(ApiException e) {
    if (e.statusCode == 401) return 'ERR_CREDENTIALS';
    if (e.statusCode == 409) return 'ERR_TAKEN';
    if (e.statusCode == 400) return 'ERR_INVALID';
    return e.message;
  }

  Future<String?> register(String email, String password) async {
    try {
      await _api.ensureAuth(force: true); // fresh token even if the old one expired
      final data = asMap(await _api.post('/auth/register', data: {'email': email, 'password': password}));
      await _api.setToken(data['token'] as String);
      await _setEmail(asMap(data['user'])['email'] as String?);
      return null;
    } on ApiException catch (e) {
      return _code(e);
    } catch (e) {
      return '$e';
    }
  }

  Future<String?> signIn(String email, String password) async {
    try {
      final data = asMap(await _api.post('/auth/login', data: {'email': email, 'password': password}));
      await _api.setToken(data['token'] as String);
      await _setEmail(asMap(data['user'])['email'] as String?);
      await ref.read(favoritesProvider.notifier).restoreFromServer(); // bring the account's favourites back
      return null;
    } on ApiException catch (e) {
      return _code(e);
    } catch (e) {
      return '$e';
    }
  }

  Future<void> signOut() async {
    await _api.clearToken();
    await _setEmail(null);
    try {
      await _api.ensureAuth(); // fall back to the anonymous device session
    } catch (_) {}
  }

  /// Deletes the account (or the anonymous profile) and every favourite on the server and on this device.
  Future<String?> deleteAccount() async {
    try {
      await _api.ensureAuth();
      await _api.delete('/me');
    } on ApiException catch (e) {
      if (e.statusCode != 401) return _code(e); // 401 = already gone
    } catch (e) {
      return '$e';
    }
    await _api.clearToken();
    await ref.read(favoritesProvider.notifier).clearAll();
    await _setEmail(null);
    try {
      await _api.ensureAuth();
    } catch (_) {}
    return null;
  }
}

final accountProvider = NotifierProvider<AccountNotifier, AccountState>(AccountNotifier.new);
