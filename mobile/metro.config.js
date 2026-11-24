// https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Business rules shared with the web app and edge functions live outside this
// project (imported as @shared/*), so Metro has to be allowed to read them.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../supabase/functions/_shared')];

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
