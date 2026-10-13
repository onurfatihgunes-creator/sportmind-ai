/**
 * Regression for the startup order Logo -> Home -> Welcome: on first launch Home (the gate's
 * children) must never be mounted, not even for a frame, and Welcome must be what is on screen.
 */
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import OnboardingGate from './OnboardingGate';

jest.mock('@/components/WelcomeScreen', () => {
  const { Pressable: P, Text: T } = require('react-native');
  return {
    __esModule: true,
    default: ({ onFinish }: { onFinish: () => void }) => (
      <P testID="welcome" onPress={onFinish}>
        <T>welcome screen</T>
      </P>
    ),
  };
});

const mounts = { home: 0, unmounts: 0 };
function Home() {
  // Counted in render AND effects: either one happening on first launch would be the bug.
  mounts.home += 1;
  return <Text>home</Text>;
}

beforeEach(() => {
  mounts.home = 0;
  mounts.unmounts = 0;
});

function texts(r: TestRenderer.ReactTestRenderer) {
  return r.root.findAllByType(Text).map((n) => n.props.children);
}

test('first launch: Welcome is shown and Home is never rendered', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <OnboardingGate hasSeenWelcome={false} onFinishWelcome={() => {}}>
        <Home />
      </OnboardingGate>,
    );
  });
  expect(texts(renderer)).toEqual(['welcome screen']);
  expect(mounts.home).toBe(0);
});

test('returning user: Home is rendered and Welcome is not', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <OnboardingGate hasSeenWelcome={true} onFinishWelcome={() => {}}>
        <Home />
      </OnboardingGate>,
    );
  });
  expect(texts(renderer)).toEqual(['home']);
  expect(renderer.root.findAllByProps({ testID: 'welcome' })).toHaveLength(0);
});

test('finishing Welcome hands over to Home exactly once, and passes the finish callback through', () => {
  const finished = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <OnboardingGate hasSeenWelcome={false} onFinishWelcome={finished}>
        <Home />
      </OnboardingGate>,
    );
  });
  act(() => {
    renderer.root.findAllByProps({ testID: 'welcome' })[0].props.onPress();
  });
  expect(finished).toHaveBeenCalledTimes(1);

  act(() => {
    renderer.update(
      <OnboardingGate hasSeenWelcome={true} onFinishWelcome={finished}>
        <Home />
      </OnboardingGate>,
    );
  });
  expect(texts(renderer)).toEqual(['home']);
  expect(mounts.home).toBe(1);
});
