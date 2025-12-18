import type { ILoadOptionsFunctions } from 'n8n-workflow';

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
export function parseMaybeObject(val: string): any {
  const t = (val || '').trim();
  if (!t) return undefined;
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t); } catch { /* fallthrough */ }
  }
  return t;
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
