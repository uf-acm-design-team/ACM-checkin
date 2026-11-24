// https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Business rules shared with the web app and edge functions live outside this
// project (imported as @shared/*), so Metro has to be allowed to read them.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../supabase/functions/_shared')];

module.exports = config;
