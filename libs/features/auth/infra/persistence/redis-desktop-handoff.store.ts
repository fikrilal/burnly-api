import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../../platform/redis/redis.service';
import type {
  DesktopHandoffRecord,
  DesktopHandoffStore,
} from '../../app/ports/desktop-handoff.store';

const KEY_PREFIX = 'auth:desktop_handoff:';

function isHandoffRecord(value: unknown): value is DesktopHandoffRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const userId = Reflect.get(value, 'userId');
  const codeChallenge = Reflect.get(value, 'codeChallenge');
  const redirectUri = Reflect.get(value, 'redirectUri');
  const client = Reflect.get(value, 'client');
  const createdAtMs = Reflect.get(value, 'createdAtMs');
  return (
    typeof userId === 'string' &&
    typeof codeChallenge === 'string' &&
    typeof redirectUri === 'string' &&
    client === 'desktop' &&
    typeof createdAtMs === 'number'
  );
}

@Injectable()
export class RedisDesktopHandoffStore implements DesktopHandoffStore {
  constructor(private readonly redis: RedisService) {}

  async save(codeHash: string, record: DesktopHandoffRecord, ttlSeconds: number): Promise<boolean> {
    if (!this.redis.isEnabled()) return false;
    const client = this.redis.getClient();
    const key = KEY_PREFIX + codeHash;
    const payload = JSON.stringify(record);
    const result = await client.set(key, payload, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async consume(codeHash: string): Promise<DesktopHandoffRecord | null> {
    if (!this.redis.isEnabled()) return null;
    const client = this.redis.getClient();
    const key = KEY_PREFIX + codeHash;
    const raw = await client.getdel(key);
    if (raw === null || raw === undefined || raw === '') return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isHandoffRecord(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
