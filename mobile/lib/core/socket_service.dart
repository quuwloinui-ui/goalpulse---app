import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../data/models/json.dart';
import '../data/models/match.dart';
import 'config.dart';

/// Compact state change pushed by the server for a live match.
class LiveUpdate {
  const LiveUpdate({required this.id, required this.status, this.minute, this.home, this.away});

  final int id;
  final MatchStatus status;
  final int? minute;
  final int? home;
  final int? away;

  factory LiveUpdate.fromJson(Map<String, dynamic> j) {
    final score = j['score'] is Map ? asMap(j['score']) : const <String, dynamic>{};
    return LiveUpdate(
      id: toInt(j['id']),
      status: MatchStatus.parse(j['status'] as String?),
      minute: (j['minute'] as num?)?.toInt(),
      home: (score['home'] as num?)?.toInt(),
      away: (score['away'] as num?)?.toInt(),
    );
  }

  MatchSummary applyTo(MatchSummary m) =>
      m.copyWith(status: status, minute: minute, homeGoals: home, awayGoals: away);
}

/// Socket.IO client. Rooms are re-joined automatically after every reconnect.
///   live:update  -> batched changes for the home list
///   match:update -> "something changed in match X" (score, event, new stream source)
class SocketService {
  io.Socket? _socket;
  final _live = StreamController<List<LiveUpdate>>.broadcast();
  final _match = StreamController<int>.broadcast();
  final Set<int> _rooms = {};
  bool _liveSubscribed = false;

  Stream<List<LiveUpdate>> get liveUpdates => _live.stream;
  Stream<int> matchChanges(int id) => _match.stream.where((m) => m == id);

  bool get _connected => _socket?.connected ?? false;

  void connect() {
    if (_socket != null) return;
    final s = io.io(AppConfig.wsUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
    });
    s.onConnect((_) {
      if (_liveSubscribed) s.emit('live:subscribe');
      for (final id in _rooms) {
        s.emit('match:subscribe', {'id': id});
      }
    });
    s.on('live:update', (data) {
      try {
        final list = parseList(asMap(data)['matches'], LiveUpdate.fromJson);
        if (list.isNotEmpty) _live.add(list);
      } catch (e) {
        debugPrint('Bad live:update payload: $e');
      }
    });
    s.on('match:update', (data) {
      try {
        _match.add(toInt(asMap(data)['id']));
      } catch (_) {}
    });
    s.connect();
    _socket = s;
  }

  void subscribeLive() {
    _liveSubscribed = true;
    connect();
    if (_connected) _socket!.emit('live:subscribe');
  }

  void joinMatch(int id) {
    _rooms.add(id);
    connect();
    if (_connected) _socket!.emit('match:subscribe', {'id': id});
  }

  void leaveMatch(int id) {
    _rooms.remove(id);
    _socket?.emit('match:unsubscribe', {'id': id});
  }

  void dispose() {
    _socket?.dispose();
    _live.close();
    _match.close();
  }
}

final socketServiceProvider = Provider<SocketService>((ref) {
  final service = SocketService()..connect();
  ref.onDispose(service.dispose);
  return service;
});
