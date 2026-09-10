// Normalize base URL by removing trailing slash and optional /v1 suffix
export function normalizeBase(u: string): string {
  return (u || '').replace(/\/$/, '').replace(/\/v1$/, '');
}

// Generic array parser used by multiple inputs
export function parseArray(val: unknown): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : (t ? [t] : []);
    } catch {
      return t ? [t] : [];
    }
  }
  return [];
}

// Accounts parser that supports multiOptions array and legacy JSON string
export function parseAccounts(val: unknown): any[] {
  if (Array.isArray(val)) {
    return val.filter(Boolean);
  }
  return parseArray(val);
}

// Attempt to parse string into object/array, otherwise return trimmed string
// Coerce an n8n "json" field value (object or JSON string) into a plain object.
export function parseJsonObject(val: unknown, fieldLabel: string = 'Permissions'): Record<string, any> {
  if (val == null) return {};
  if (typeof val === 'object') return val as Record<string, any>;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      throw new Error(`${fieldLabel} must be a valid JSON object`);
    }
  }
  return {};
}

export function parseMaybeObject(val: string): any {
  const t = (val || '').trim();
  if (!t) return undefined;
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t); } catch { /* fallthrough */ }
  }
  return t;
}

// Parse comma-separated IDs from string, array, or JSON string.
// Handles: "id1,id2", ["id1","id2"], '["id1","id2"]', single "id1", number, etc.
export function parseCommaSeparated(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof val === 'number') {
    return [String(val)];
  }
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return [];
    // Try JSON array parse first (e.g. '["id1","id2"]')
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) {
          return parsed.map(v => String(v).trim()).filter(Boolean);
        }
      } catch { /* fall through to comma split */ }
    }
    return t.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (val != null) {
    return [String(val)].filter(Boolean);
  }
  return [];
}

// Platforms accepted by the scheduling optimal-times endpoint (entities[].type)
export const SCHEDULING_PLATFORMS = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'tiktok',
  'youtube',
  'pinterest',
  'threads',
  'gmb',
  'tumblr',
  'bluesky',
  'telegram',
];

export type SchedulingEntityRef = { id: string; type?: string };

// Parse the account picker values used by the Scheduling resource.
// The dropdown encodes options as "platform:accountId" so the platform is known
// without an extra lookup; plain account ids (e.g. from expressions) are kept
// without a type and resolved against the accounts list at execution time.
export function parseSchedulingEntityRefs(val: unknown): SchedulingEntityRef[] {
  const platforms = new Set(SCHEDULING_PLATFORMS);
  return parseCommaSeparated(val).map((raw) => {
    const separatorIndex = raw.indexOf(':');
    if (separatorIndex > 0) {
      const type = raw.slice(0, separatorIndex).trim().toLowerCase();
      const id = raw.slice(separatorIndex + 1).trim();
      if (id && platforms.has(type)) {
        return { id, type };
      }
    }
    return { id: raw };
  });
}

type OptimalTimeSlot = Record<string, any>;

// The API documents slot hours as a plain hour-of-day string ("14"). Accept the
// documented shape plus "14:00" and a 12-hour "2 PM" variant, so an unexpected
// format degrades to no scheduled_at rather than silently scheduling 12 hours off.
export function parseSlotHour(time: unknown): number | undefined {
  const raw = String(time ?? '').trim();
  if (!raw) return undefined;
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return undefined;
  let hour = parseInt(match[1], 10);
  if (!Number.isFinite(hour)) return undefined;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  }
  if (hour < 0 || hour > 23) return undefined;
  return hour;
}

function toScheduledAt(date: unknown, time: unknown): string | undefined {
  // Tolerate a full ISO timestamp by taking the leading calendar date
  const day = (typeof date === 'string' ? date.trim() : '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!day) return undefined;
  const hour = parseSlotHour(time);
  if (hour === undefined) return undefined;
  return `${day} ${String(hour).padStart(2, '0')}:00:00`;
}

function mapRecommendation(
  recommendation: any,
  meta: Record<string, any>,
  scope: string,
  extra: Record<string, any>,
): OptimalTimeSlot {
  const hour = parseSlotHour(recommendation?.time);
  const scheduledAt = toScheduledAt(recommendation?.date, recommendation?.time);
  return {
    scope,
    ...extra,
    rank: recommendation?.rank ?? null,
    day: recommendation?.day ?? null,
    date: recommendation?.date ?? null,
    time: recommendation?.time ?? null,
    hour: hour ?? null,
    score: recommendation?.score ?? null,
    ...(recommendation?.platform_breakdown ? { platform_breakdown: recommendation.platform_breakdown } : {}),
    ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    timezone: meta?.timezone ?? null,
    generated_at: meta?.generated_at ?? null,
  };
}

// Flatten an optimal-times response into one item per recommended slot, best-first.
// Slots carry a ready-to-use `scheduled_at` so they can be fed straight into a
// later Post → Create operation. Returns a single meta item when nothing ranked.
export function flattenOptimalTimes(response: any, includeIndividual: boolean): OptimalTimeSlot[] {
  const meta = (response?.meta && typeof response.meta === 'object') ? response.meta : {};
  const slots: OptimalTimeSlot[] = [];

  const globalRecommendations = response?.global?.top_recommendations;
  if (Array.isArray(globalRecommendations)) {
    for (const recommendation of globalRecommendations) {
      slots.push(mapRecommendation(recommendation, meta, 'global', {}));
    }
  }

  const individual = response?.individual;
  if (includeIndividual && individual && typeof individual === 'object') {
    for (const [accountId, account] of Object.entries(individual as Record<string, any>)) {
      const recommendations = account?.top_recommendations;
      if (!Array.isArray(recommendations)) continue;
      for (const recommendation of recommendations) {
        slots.push(mapRecommendation(recommendation, meta, 'account', {
          account_id: accountId,
          platform: account?.platform ?? null,
          source: account?.source ?? null,
        }));
      }
    }
  }

  if (slots.length === 0) {
    return [{
      ...meta,
      message: 'No optimal posting times were returned. The analysed accounts may not have enough publishing history yet — check meta.missing_entities and meta.warnings.',
    }];
  }

  return slots;
}

// Media images parser supporting new fixedCollection format and legacy string JSON
export function parseMediaImages(val: unknown): string[] {
  if (val && typeof val === 'object' && 'images' in (val as any)) {
    const images = (val as any).images;
    if (Array.isArray(images)) {
      return images.map((img: any) => img?.url).filter(Boolean);
    }
  }
  return parseArray(val);
}

// Media video parser supporting fixedCollection and legacy string
export function parseMediaVideo(val: unknown): string | undefined {
  if (val && typeof val === 'object' && 'video' in (val as any)) {
    const video = (val as any).video;
    if (video && typeof video === 'object' && 'url' in (video as any)) {
      return (video as any).url || undefined;
    }
    if (Array.isArray(video) && video.length > 0) {
      return (video[0] as any)?.url || undefined;
    }
  }
  if (typeof val === 'string') {
    return parseMaybeObject(val);
  }
  return undefined;
}
