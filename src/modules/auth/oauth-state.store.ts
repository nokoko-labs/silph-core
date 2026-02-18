import * as crypto from 'node:crypto';
import type { RedisService } from '@/cache/redis.service';

const OAUTH_STATE_PREFIX = 'oauth_state:';
const OAUTH_STATE_TTL = 600; // 10 minutes

export type OAuthStatePayload = {
  tenantSlug?: string;
};

/**
 * Redis-backed OAuth state store for passport-oauth2.
 * Preserves custom data (e.g. tenantSlug) across the OAuth redirect flow without requiring sessions.
 */
export function createOAuthStateStore(redisService: RedisService) {
  return {
    store(
      _req: unknown,
      state: OAuthStatePayload | undefined,
      _meta: unknown,
      callback: (err: Error | null, state?: string) => void,
    ) {
      const handle = crypto.randomBytes(24).toString('base64url');
      const key = `${OAUTH_STATE_PREFIX}${handle}`;
      const value = JSON.stringify(state ?? {});
      redisService.set(key, value, OAUTH_STATE_TTL).then(
        () => callback(null, handle),
        (err) => callback(err instanceof Error ? err : new Error(String(err))),
      );
    },
    verify(
      req: Record<string, unknown> & { oauthContextState?: OAuthStatePayload },
      providedState: string,
      callback: (err: Error | null, ok: boolean, state?: OAuthStatePayload) => void,
    ) {
      const key = `${OAUTH_STATE_PREFIX}${providedState}`;
      redisService
        .get(key)
        .then((data) => {
          if (!data) {
            return callback(null, false);
          }
          return redisService.del(key).then(() => {
            try {
              const parsed = JSON.parse(data) as OAuthStatePayload;
              req.oauthContextState = parsed;
              callback(null, true, parsed);
            } catch {
              callback(null, false);
            }
          });
        })
        .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), false));
    },
  };
}
