import * as api from './index';
import { EvictionPolicy } from './types/cache-config';
import { EVENT } from './types/events';

describe('package entry point', () => {
  it('re-exports the eviction policy enum and event constants', () => {
    expect(api.EvictionPolicy).toBe(EvictionPolicy);
    expect(api.EVENT).toBe(EVENT);
  });
});
