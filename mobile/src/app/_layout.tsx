import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';

// Keep the launch screen up until we know whether someone is signed in
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * (app)/  everything behind sign-in; its layout sends signed-out users to /login
 * login   sends signed-in users home
 * +native-intent  keeps packvision://auth (SAP sign-in handing back) from navigating
 * Only the navigator is rendered here: anything beside it makes Expo Router re-register it and loop.
 */
function RootStack() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
    </Stack>
  );
}
