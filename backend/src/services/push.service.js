'use strict';
const admin = require('firebase-admin');

function loadCredentials(env) {
  try {
    if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      return JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    }
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    /* handled by caller */
  }
  return null;
}

const { composeFixtureMessage, fixtureCondition, reminderCondition, withLanguage, LANGUAGES } = require('./pushMessages');

class PushService {
  constructor({ env, logger }) {
    this.logger = logger;
    this.app = null;
    const creds = loadCredentials(env);
    if (!creds) {
      logger.warn('FCM credentials not set - push notifications run in dry-run mode (logged only)');
      return;
    }
    try {
      this.app = admin.initializeApp({ credential: admin.credential.cert(creds) }, 'goalpulse');
      logger.info('Firebase Cloud Messaging initialised');
    } catch (err) {
      logger.error({ err: err.message }, 'FCM init failed - falling back to dry-run mode');
    }
  }

  get enabled() {
    return Boolean(this.app);
  }

  async send({ topic, condition, title, body, data = {}, imageUrl }) {
    const message = {
      notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { channelId: 'matches' } },
      apns: { payload: { aps: { sound: 'default' } } },
      ...(condition ? { condition } : { topic }),
    };
    if (!this.app) {
      this.logger.info({ message }, '[push:dry-run]');
      return { dryRun: true };
    }
    return { id: await admin.messaging(this.app).send(message) };
  }

  /** One message per language: devices subscribe to lang_en / lang_ar next to their match and team topics. */
  notifyFixture(kind, f, extra = {}) {
    const base = kind === 'REMINDER' ? reminderCondition(f) : fixtureCondition(f);
    return Promise.all(
      LANGUAGES.map((lang) => {
        const { title, body } = composeFixtureMessage(kind, f, extra, lang);
        return this.send({ condition: withLanguage(base, lang), title, body, data: { type: kind, fixtureId: f.id } });
      }),
    );
  }
}

module.exports = { PushService };
