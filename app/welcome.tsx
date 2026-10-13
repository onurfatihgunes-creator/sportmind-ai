import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import WelcomeScreen from '@/components/WelcomeScreen';
import { HAS_SEEN_WELCOME_KEY } from '@/constants/storageKeys';

/**
 * The /welcome route, kept for deep links. First launch does not come through here: the root
 * layout shows WelcomeScreen directly (see components/OnboardingGate.tsx), so Home is never
 * mounted underneath it.
 */
export default function WelcomeRoute() {
  return (
    <WelcomeScreen
      onFinish={async () => {
        await AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true');
        router.replace('/(tabs)');
      }}
    />
  );
}
