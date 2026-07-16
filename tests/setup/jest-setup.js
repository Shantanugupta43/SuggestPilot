/**
 * Jest global setup — runs after Jest framework is initialised.
 * Resets chrome mocks before each test to prevent state leakage.
 *
 * Also stubs the global fetch so network tests never hit real endpoints.
 */

beforeEach(() => {
  // Reset chrome API call history and in-memory storage
  if (typeof __resetChromeMocks === 'function') {
    __resetChromeMocks();
  }

  // Stub fetch globally; individual tests override with mockResolvedValue
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: jest.fn(() => null) },
      json: jest.fn(() => Promise.resolve({}))
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});
