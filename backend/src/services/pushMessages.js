'use strict';
const LANGUAGES = ['en', 'ar'];

const WORDS = {
  en: { sep: ' vs ', KICKOFF: 'Kick-off', GOAL: 'GOAL!', RED: 'Red card', HT: 'Half-time', FT: 'Full-time', SOON: 'Starting soon', inMin: (m) => `in ${m} min` },
  ar: { sep: ' × ', KICKOFF: 'بدأت المباراة', GOAL: 'هدف!', RED: 'بطاقة حمراء', HT: 'نهاية الشوط الأول', FT: 'نهاية المباراة', SOON: 'تبدأ قريباً', inMin: (m) => `بعد ${m} دقيقة` },
};

const scoreLine = (f) => `${f.home.name} ${f.score?.home ?? 0}-${f.score?.away ?? 0} ${f.away.name}`;
const clockText = (f) => (f.minute ? `${f.minute}'` : null);

/** Pure: builds the notification text for a fixture event in the given language (unit-tested). */
function composeFixtureMessage(kind, f, extra = {}, lang = 'en') {
  const w = WORDS[lang] || WORDS.en;
  const vs = `${f.home.name}${w.sep}${f.away.name}`;
  switch (kind) {
    case 'KICKOFF':
      return { title: `🟢 ${w.KICKOFF}`, body: `${vs} · ${f.leagueName}` };
    case 'GOAL':
      return { title: `⚽ ${w.GOAL} ${scoreLine(f)}`, body: [extra.scorer, clockText(f)].filter(Boolean).join(' · ') || f.leagueName };
    case 'RED_CARD':
      return {
        title: `🟥 ${w.RED} · ${vs}`,
        body: [extra.event?.player, extra.event?.minute ? `${extra.event.minute}'` : null].filter(Boolean).join(' · ') || scoreLine(f),
      };
    case 'HALF_TIME':
      return { title: `⏸ ${w.HT} · ${scoreLine(f)}`, body: f.leagueName };
    case 'FULL_TIME':
      return { title: `🏁 ${w.FT} · ${scoreLine(f)}`, body: f.leagueName };
    case 'REMINDER':
      return { title: `⏰ ${w.SOON}`, body: `${vs} · ${w.inMin(extra.minutes ?? '')} · ${f.leagueName}` };
    default:
      return { title: vs, body: f.leagueName };
  }
}

/**
 * One FCM *condition* per event: a device subscribed to the match topic AND/OR either team topic
 * receives the message exactly once, and the server never has to fan out to individual tokens.
 */
const fixtureCondition = (f) => `'match_${f.id}' in topics || 'team_${f.home.id}' in topics || 'team_${f.away.id}' in topics`;
const reminderCondition = (f) => `'remind_match_${f.id}' in topics || 'remind_team_${f.home.id}' in topics || 'remind_team_${f.away.id}' in topics`;
/** Restricts a condition to devices whose app language is `lang` (FCM allows up to 5 topics per condition). */
const withLanguage = (condition, lang) => `(${condition}) && 'lang_${lang}' in topics`;

module.exports = { LANGUAGES, composeFixtureMessage, fixtureCondition, reminderCondition, withLanguage };
