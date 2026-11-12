import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/strings.dart';

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// DST-safe day arithmetic (adding a Duration of 24h would drift on clock-change days).
DateTime addDays(DateTime d, int n) => DateTime(d.year, d.month, d.day + n);

/// Whole calendar days from [b] to [a] (a - b), immune to DST offsets.
int daysBetween(DateTime a, DateTime b) =>
    DateTime.utc(a.year, a.month, a.day).difference(DateTime.utc(b.year, b.month, b.day)).inDays;

/// Kick-off time in the device's timezone, honouring the 12h/24h preference (see GoalPulseApp.builder).
String formatKickoff(BuildContext context, DateTime t) {
  final fmt = MediaQuery.alwaysUse24HourFormatOf(context) ? DateFormat.Hm() : DateFormat.jm();
  return fmt.format(t);
}

String formatFullDate(DateTime t) => DateFormat.yMMMEd().format(t);

String dayLabel(BuildContext context, DateTime day, DateTime today) {
  switch (daysBetween(day, today)) {
    case -1:
      return context.tr('yesterday');
    case 0:
      return context.tr('today');
    case 1:
      return context.tr('tomorrow');
    default:
      return DateFormat.E().format(day);
  }
}
