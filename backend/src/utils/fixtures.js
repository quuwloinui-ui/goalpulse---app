'use strict';
const stripEvents = ({ events, ...rest }) => rest; // eslint-disable-line no-unused-vars
const TERMINAL = new Set(['FINISHED', 'CANCELLED', 'POSTPONED']);

module.exports = { stripEvents, TERMINAL };
