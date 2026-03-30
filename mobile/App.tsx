import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/providers/AuthProvider';
import LoginScreen from './src/screens/LoginScreen';
import ChatScreen from './src/screens/ChatScreen';

function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <View style={styles.container}></View>; // Could return splash screen here
  }

  return user ? <ChatScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <View style={styles.container}>
        <RootNavigator />
        <StatusBar style="auto" />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
