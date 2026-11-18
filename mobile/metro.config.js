const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro only bundles files inside mobile/ by default. The membership rules
// shared with web live in supabase/functions/_shared/, so watch that folder too.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, '../supabase/functions/_shared'),
];

module.exports = config;
