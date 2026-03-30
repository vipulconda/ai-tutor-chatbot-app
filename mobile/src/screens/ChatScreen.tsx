import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Switch } from 'react-native';
import { useChat } from '@ai-sdk/react';
import { useAuth } from '../providers/AuthProvider';
import { apiClient } from '../lib/api';

export default function ChatScreen() {
  const { logout } = useAuth();
  const [isAutoMode, setIsAutoMode] = useState(true);
  
  // @ts-ignore
  const { messages, input, setInput, append, isLoading } = useChat({
    // @ts-ignore
    api: `${apiClient.defaults.baseURL}/api/ai/chat`,
    headers: {
      Authorization: apiClient.defaults.headers.common['Authorization'] as string,
    },
    body: {
      modelPreference: isAutoMode ? 'auto' : 'premium'
    },
    onResponse: (response: Response) => {
      console.log(`[Chat API Response] ${response.status} ${response.statusText}`);
    },
    onFinish: (message: any) => {
      console.log(`[Chat API Message Finished]`, JSON.stringify(message, null, 2));
    },
    onError: (error: Error) => {
      console.error(`[Chat API Error]`, error);
    }
  } as any);

  const sendMessage = () => {
    if (!input.trim() || isLoading) return;
    // We utilize append directly to ensure we sidestep web Event dependencies.
    append({ role: 'user', content: input });
    setInput('');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>AI Tutor</Text>
          <Text style={styles.headerSubtitle}>Always ready to help</Text>
        </View>

        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>{isAutoMode ? 'Auto Mode' : 'Premium'}</Text>
          <Switch 
            value={isAutoMode}
            onValueChange={setIsAutoMode}
            trackColor={{ false: '#D1D5DB', true: '#A7F3D0' }}
            thumbColor={isAutoMode ? '#10B981' : '#f4f3f4'}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>

        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.chatArea} contentContainerStyle={{ paddingBottom: 20 }}>
        {messages.map((m: any) => (
          <View 
            key={m.id} 
            style={[
              styles.messageBubble, 
              m.role === 'user' ? styles.userMessage : styles.aiMessage
            ]}
          >
            <Text style={m.role === 'user' ? styles.userText : styles.aiText}>
               {m.content}
            </Text>
          </View>
        ))}
        {isLoading && (
          <View style={[styles.messageBubble, styles.aiMessage]}>
             <ActivityIndicator size="small" color="#4F46E5" />
          </View>
        )}
      </ScrollView>

      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput} // Directly update state
          placeholder="Ask me anything..."
          placeholderTextColor="#9CA3AF"
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]} 
          onPress={sendMessage}
          disabled={!input.trim() || isLoading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 5,
  },
  headerTitle: { color: '#111827', fontSize: 24, fontWeight: '800' },
  headerSubtitle: { color: '#6B7280', fontSize: 13, marginTop: 2 },
  toggleContainer: { marginRight: 15, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { fontSize: 10, color: '#6B7280', marginBottom: 2, fontWeight: 'bold' },
  logoutButton: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#FEE2E2', borderRadius: 20 },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: 'bold' },
  chatArea: { flex: 1, padding: 15 },
  messageBubble: { 
    padding: 16, 
    borderRadius: 20, 
    marginBottom: 12, 
    maxWidth: '85%',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  userMessage: { 
    backgroundColor: '#4F46E5', 
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5
  },
  aiMessage: { 
    backgroundColor: '#FFFFFF', 
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5
  },
  userText: { color: '#ffffff', fontSize: 16, lineHeight: 24 },
  aiText: { color: '#374151', fontSize: 16, lineHeight: 24 },
  inputWrapper: { 
    flexDirection: 'row', 
    padding: 15, 
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'flex-end'
  },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    marginRight: 10,
    fontSize: 16,
    color: '#111827'
  },
  sendButton: {
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: 25,
    height: 50,
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF'
  },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
