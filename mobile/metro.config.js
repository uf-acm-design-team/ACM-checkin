const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Rules shared by the website and the app live in supabase/functions/_shared,
// outside this folder. Metro only bundles files under the project root or a
// watch folder, so without this the app fails with "Unable to resolve module".
config.watchFolders = [path.resolve(__dirname, '../supabase/functions/_shared')];

// Keep tabs that aren't showing drawn (off screen), so swiping between Home and
// Calendar can show the next page. See src/navigation/tab-screen.tsx.
const TAB_SCREEN = path.resolve(__dirname, 'src/navigation/tab-screen.tsx');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === './ScreenFallback' &&
    context.originModulePath.includes(path.join('bottom-tabs', 'views', 'BottomTabView'))
  ) {
    return { type: 'sourceFile', filePath: TAB_SCREEN };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
