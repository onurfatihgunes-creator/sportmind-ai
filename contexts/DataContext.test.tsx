/**
 * DataProvider's load status: ready on live data, failed on an error/empty answer or on timeout
 * (so the loading screen can never spin forever), a late answer still upgrades to live, and Retry
 * is the only thing that refetches.
 */
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DataProvider, INITIAL_LOAD_TIMEOUT_MS, useAppData } from './DataContext';
import { fetchLiveData } from '@/data/liveData';
import * as mock from '@/data/mockData';

jest.mock('@/data/liveData', () => ({ fetchLiveData: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const fetchMock = fetchLiveData as jest.Mock;

const live = {
  teams: {},
  matches: [],
  changeEvents: [],
  analysisChanges: [],
  trackRecord: [],
};

let latest!: ReturnType<typeof useAppData>;
function Probe() {
  latest = useAppData();
  return <Text>{latest.status}</Text>;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function mount() {
  await act(async () => {
    TestRenderer.create(
      <DataProvider>
        <Probe />
      </DataProvider>,
    );
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
});
afterEach(() => jest.useRealTimers());

test('starts loading with the demo data in place, then becomes ready on live data', async () => {
  const d = deferred<typeof live | null>();
  fetchMock.mockReturnValue(d.promise);
  await mount();
  expect(latest.status).toBe('loading');
  expect(latest.loading).toBe(true);
  expect(latest.isLive).toBe(false);
  expect(latest.matches).toBe(mock.matches);

  await act(async () => d.resolve(live));
  expect(latest.status).toBe('ready');
  expect(latest.loading).toBe(false);
  expect(latest.isLive).toBe(true);
});

test('an empty/failed answer from a configured backend is "failed", and the demo data stays in place', async () => {
  fetchMock.mockResolvedValue(null);
  await mount();
  expect(latest.status).toBe('failed');
  expect(latest.loading).toBe(false);
  expect(latest.isLive).toBe(false);
  expect(latest.matches).toBe(mock.matches);
});

test('a rejected fetch is "failed", never an unhandled error', async () => {
  fetchMock.mockRejectedValue(new Error('network'));
  await mount();
  expect(latest.status).toBe('failed');
});

test('a fetch that never answers fails after INITIAL_LOAD_TIMEOUT_MS instead of loading forever', async () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  await mount();
  expect(latest.status).toBe('loading');
  await act(async () => {
    jest.advanceTimersByTime(INITIAL_LOAD_TIMEOUT_MS - 1);
  });
  expect(latest.status).toBe('loading');
  await act(async () => {
    jest.advanceTimersByTime(2);
  });
  expect(latest.status).toBe('failed');
});

test('a late answer after the timeout still upgrades to live data', async () => {
  const d = deferred<typeof live | null>();
  fetchMock.mockReturnValue(d.promise);
  await mount();
  await act(async () => {
    jest.advanceTimersByTime(INITIAL_LOAD_TIMEOUT_MS + 1);
  });
  expect(latest.status).toBe('failed');
  await act(async () => d.resolve(live));
  expect(latest.status).toBe('ready');
  expect(latest.isLive).toBe(true);
});

test('Retry is the only refetch: it goes back to loading and can succeed', async () => {
  fetchMock.mockResolvedValueOnce(null);
  await mount();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(latest.status).toBe('failed');

  const d = deferred<typeof live | null>();
  fetchMock.mockReturnValueOnce(d.promise);
  await act(async () => latest.retry());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(latest.status).toBe('loading');

  await act(async () => d.resolve(live));
  expect(latest.status).toBe('ready');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
