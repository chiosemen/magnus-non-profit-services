#!/usr/bin/env node

const flag = (process.env.ALLOW_MOBILE_PREVIEW || '').toLowerCase();

if (flag === 'true') {
  process.exit(0);
}

// eslint-disable-next-line no-console
console.error(
  [
    'apps/mobile is excluded from the current staging/production scope.',
    'Set ALLOW_MOBILE_PREVIEW=true to run the Expo app locally for exploratory work.'
  ].join(' ')
);

process.exit(1);
