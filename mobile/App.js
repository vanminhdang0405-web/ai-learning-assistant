import { colors } from './src/theme';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screen/HomeScreen';
import DocumentsScreen from './src/screen/DocumentsScreen';
import DocumentTextScreen from './src/screen/DocumentTextScreen';
import DocumentSummaryScreen from './src/screen/DocumentSummaryScreen';
import {
  LoginScreen,
  RegisterScreen,
} from './src/screen/AuthScreen';
import ProfileScreen from './src/screen/ProfileScreen';
import ForgotPasswordScreen from './src/screen/ForgotPasswordScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />

      <NavigationContainer>
        <Stack.Navigator
          id="RootStack"
          initialRouteName="Home"
          screenOptions={{
            headerTintColor: colors.heading,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
            headerTitleStyle: { fontSize: 16, fontWeight: '600' },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ title: 'Đăng nhập' }}
          />

          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ title: 'Đăng ký' }}
          />

          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
              options={{ title: 'Hồ sơ cá nhân' }}
          />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ title: 'Quên mật khẩu' }}
          />
          <Stack.Screen
            name="Documents"
            component={DocumentsScreen}
            options={{ title: 'Tài liệu học tập' }}
          />
          <Stack.Screen
            name="DocumentText"
            component={DocumentTextScreen}
            options={{ title: 'Không gian tài liệu' }}
          />
          <Stack.Screen
            name="DocumentSummary"
            component={DocumentSummaryScreen}
            options={{ title: 'Tóm tắt tài liệu' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}