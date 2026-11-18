const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Rules shared by the website and the app live in supabase/functions/_shared,
// outside this folder. Metro only bundles files under the project root or a
// watch folder, so without this the app fails with "Unable to resolve module".
config.watchFolders = [path.resolve(__dirname, '../supabase/functions/_shared')];

module.exports = config;
