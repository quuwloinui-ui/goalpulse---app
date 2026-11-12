Map<String, dynamic> asMap(Object? o) => Map<String, dynamic>.from(o as Map);

List<T> parseList<T>(Object? raw, T Function(Map<String, dynamic>) from) =>
    [for (final e in ((raw as List?) ?? const [])) from(asMap(e))];

int toInt(Object? v, [int fallback = 0]) => v is num ? v.toInt() : fallback;
