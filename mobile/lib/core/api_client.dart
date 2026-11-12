import 'dart:math';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'storage.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// Thin Dio wrapper: base URL, anonymous device auth (JWT) with one automatic re-auth on 401.
class ApiClient {
  ApiClient(this._prefs) {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept': 'application/json'},
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final t = token;
        if (t != null) options.headers['Authorization'] = 'Bearer $t';
        handler.next(options);
      },
      onError: (e, handler) async {
        final req = e.requestOptions;
        if (e.response?.statusCode == 401 && req.extra['retried'] != true && !req.path.startsWith('/auth/')) {
          try {
            await ensureAuth(force: true);
            req.extra['retried'] = true;
            req.headers['Authorization'] = 'Bearer $token';
            return handler.resolve(await _dio.fetch<dynamic>(req));
          } catch (_) {/* fall through to the original error */}
        }
        handler.next(e);
      },
    ));
  }

  final SharedPreferences _prefs;
  late final Dio _dio;

  static const _kToken = 'auth.token';
  static const _kDeviceId = 'auth.deviceId';

  String? get token => _prefs.getString(_kToken);

  Future<void> setToken(String value) => _prefs.setString(_kToken, value);
  Future<void> clearToken() => _prefs.remove(_kToken);

  String get deviceId {
    var id = _prefs.getString(_kDeviceId);
    if (id == null) {
      final r = Random.secure();
      id = List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
      _prefs.setString(_kDeviceId, id);
    }
    return id;
  }

  Future<void> ensureAuth({bool force = false, String? fcmToken}) async {
    if (!force && token != null) return;
    final data = await _send(() => _dio.post<dynamic>('/auth/device', data: {
          'deviceId': deviceId,
          'platform': kIsWeb ? 'WEB' : (defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID'),
          'locale': ui.PlatformDispatcher.instance.locale.toLanguageTag(),
          'tzOffsetMin': DateTime.now().timeZoneOffset.inMinutes,
          if (fcmToken != null) 'fcmToken': fcmToken,
        }));
    await _prefs.setString(_kToken, (data as Map)['token'] as String);
  }

  Future<dynamic> _send(Future<Response<dynamic>> Function() call) async {
    try {
      return (await call()).data;
    } on DioException catch (e) {
      final body = e.response?.data;
      final message = body is Map && body['error'] != null ? '${body['error']}' : (e.message ?? 'Network error');
      throw ApiException(message, statusCode: e.response?.statusCode);
    }
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get<dynamic>(path, queryParameters: query));
  Future<dynamic> post(String path, {Object? data}) => _send(() => _dio.post<dynamic>(path, data: data));
  Future<dynamic> put(String path, {Object? data}) => _send(() => _dio.put<dynamic>(path, data: data));
  Future<dynamic> delete(String path) => _send(() => _dio.delete<dynamic>(path));
}

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(sharedPrefsProvider)));
