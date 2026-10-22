import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'sign-in',
};

/** Signed-out stack: sign in and sign up. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
