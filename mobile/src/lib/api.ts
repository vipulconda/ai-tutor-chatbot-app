import axios from 'axios';
import { Platform } from 'react-native';
import { getItemAsync } from './storage';

import Constants from 'expo-constants';

// Maps to your Next.js local server
// iOS simulator can hit localhost. Android uses 10.0.2.2.
const getBaseUrl = () => {
  if (__DEV__) {
    const debuggerHost = Constants.expoConfig?.hostUri;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return `http://${ip}:3000`;
    }
    // Fallback if not injected by Metro
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }
  // Production URL here:
  return 'https://ai-tutor-frontend.vercel.app';
};

export const apiClient = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true, // Crucial for NextAuth cookies
});

// We attach the NextAuth session token (if any) if we stored it properly
apiClient.interceptors.request.use(async (config) => {
  try {
    const sessionCookie = await getItemAsync('authjs.session-token');
    if (sessionCookie) {
      // Send as authorization so we can reconstruct session on the server
      config.headers.Authorization = `Bearer ${sessionCookie}`;
    }
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  } catch (error) {
    console.error('Failed to get token from secure store', error);
  }
  return config;
});

// Log all API responses
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}:`, JSON.stringify(response.data, null, 2));
    return response;
  },
  (error) => {
    console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}:`, error.response?.data || error.message);
    return Promise.reject(error);
  }
);
