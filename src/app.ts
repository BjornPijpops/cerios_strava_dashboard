import { AppConfig, loadConfig } from './infra/config';
import { JsonActivityRepository } from './infra/activity-repository';
import { DashboardService } from './services/dashboard-service';
import { SyncService } from './services/sync-service';
import { RateLimitRegistry } from './strava/rate-limit';
import { StravaClient } from './strava/client';
import { JsonTokenStore } from './strava/token-store';
import { JsonCredentialStore } from './strava/credential-store';

/** Composition root: the only place concrete implementations are wired together. */
export function createApp(config: AppConfig = loadConfig()) {
  const tokens = new JsonTokenStore(config.dataDir);
  const credentials = new JsonCredentialStore(config.dataDir);
  if (config.seedAthleteId && !tokens.get(config.seedAthleteId)) {
    if (config.seedRefreshToken) {
      // expiresAt 0 forces a refresh on first use
      tokens.set(config.seedAthleteId, { accessToken: '', refreshToken: config.seedRefreshToken, expiresAt: 0 });
    }
  }
  if (config.seedAthleteId && config.clientId && config.clientSecret && !credentials.get(config.seedAthleteId)) {
    credentials.set(config.seedAthleteId, { clientId: config.clientId, clientSecret: config.clientSecret });
  }

  const repo = new JsonActivityRepository(config.dataDir);
  const rateLimit = new RateLimitRegistry();
  const client = new StravaClient(credentials, tokens, rateLimit);
  const sync = new SyncService(client, repo, config.challenge, Date.now, (id) => !!tokens.get(id));
  const dashboard = new DashboardService(repo, config.challenge);
  return { config, repo, rateLimit, client, sync, dashboard };
}
