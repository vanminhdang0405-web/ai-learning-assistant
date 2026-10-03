import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screen/HomeScreen';
import {
  LoginScreen,
  RegisterScreen,
} from './src/screen/AuthScreen';
import ProfileScreen from './src/screen/ProfileScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />

      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerTintColor: '#172033',
            headerStyle: { backgroundColor: '#F4F7FB' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#F4F7FB' },
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
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}