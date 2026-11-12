'use strict';
// Feature flags the admin panel can toggle. Missing DB rows fall back to these defaults.
const FEATURE_DEFAULTS = [
  ['streams', true, 'Show the Watch tab and stream icons'],
  ['ads', true, 'Show banners / advertisements in the app'],
  ['news', true, 'Expose the news endpoint'],
  ['maintenance', false, 'Show a maintenance notice in the app'],
];

const DEFAULT_FEATURES = Object.fromEntries(FEATURE_DEFAULTS.map(([k, v]) => [k, v]));

module.exports = { FEATURE_DEFAULTS, DEFAULT_FEATURES };
