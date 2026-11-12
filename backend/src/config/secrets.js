'use strict';
const WEAK = /replace[-_ ]?with|change[-_ ]?me|example|password|secret|123456|qwerty/i;

/** Returns a problem description, or null when the JWT secret is acceptable for production. */
function assessJwtSecret(secret) {
  if (!secret || secret.length < 32) return 'must be at least 32 characters in production (try: openssl rand -hex 32)';
  if (WEAK.test(secret)) return 'looks like a placeholder; generate a random value (openssl rand -hex 32)';
  return null;
}

function assessAdminPassword(password) {
  if (password.length < 12) return 'must be at least 12 characters in production';
  if (WEAK.test(password)) return 'looks like a sample or weak password; choose another';
  return null;
}

module.exports = { assessJwtSecret, assessAdminPassword };
