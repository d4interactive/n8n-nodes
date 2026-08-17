"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEDULING_PLATFORMS = void 0;
exports.normalizeBase = normalizeBase;
exports.parseArray = parseArray;
exports.parseAccounts = parseAccounts;
exports.parseJsonObject = parseJsonObject;
exports.parseMaybeObject = parseMaybeObject;
exports.parseCommaSeparated = parseCommaSeparated;
exports.parseSchedulingEntityRefs = parseSchedulingEntityRefs;
exports.parseSlotHour = parseSlotHour;
exports.flattenOptimalTimes = flattenOptimalTimes;
exports.parseMediaImages = parseMediaImages;
exports.parseMediaVideo = parseMediaVideo;
// Normalize base URL by removing trailing slash and optional /v1 suffix
function normalizeBase(u) {
    return (u || '').replace(/\/$/, '').replace(/\/v1$/, '');
}
// Generic array parser used by multiple inputs
function parseArray(val) {
    if (Array.isArray(val))
        return val;
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t)
            return [];
        try {
            const parsed = JSON.parse(t);
            return Array.isArray(parsed) ? parsed : (t ? [t] : []);
        }
        catch {
            return t ? [t] : [];
        }
    }
    return [];
}
// Accounts parser that supports multiOptions array and legacy JSON string
function parseAccounts(val) {
    if (Array.isArray(val)) {
        return val.filter(Boolean);
    }
    return parseArray(val);
}
// Attempt to parse string into object/array, otherwise return trimmed string
// Coerce an n8n "json" field value (object or JSON string) into a plain object.
function parseJsonObject(val) {
    if (val == null)
        return {};
    if (typeof val === 'object')
        return val;
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t)
            return {};
        try {
            const parsed = JSON.parse(t);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        }
        catch {
            throw new Error('Permissions must be a valid JSON object');
        }
    }
    return {};
}
function parseMaybeObject(val) {
    const t = (val || '').trim();
    if (!t)
        return undefined;
    if (t.startsWith('{') || t.startsWith('[')) {
        try {
            return JSON.parse(t);
        }
        catch { /* fallthrough */ }
    }
    return t;
}
// Parse comma-separated IDs from string, array, or JSON string.
// Handles: "id1,id2", ["id1","id2"], '["id1","id2"]', single "id1", number, etc.
function parseCommaSeparated(val) {
    if (Array.isArray(val)) {
        return val.map(v => String(v).trim()).filter(Boolean);
    }
    if (typeof val === 'number') {
        return [String(val)];
    }
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t)
            return [];
        // Try JSON array parse first (e.g. '["id1","id2"]')
        if (t.startsWith('[')) {
            try {
                const parsed = JSON.parse(t);
                if (Array.isArray(parsed)) {
                    return parsed.map(v => String(v).trim()).filter(Boolean);
                }
            }
            catch { /* fall through to comma split */ }
        }
        return t.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (val != null) {
        return [String(val)].filter(Boolean);
    }
    return [];
}
// Platforms accepted by the scheduling optimal-times endpoint (entities[].type)
exports.SCHEDULING_PLATFORMS = [
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
// Parse the account picker values used by the Scheduling resource.
// The dropdown encodes options as "platform:accountId" so the platform is known
// without an extra lookup; plain account ids (e.g. from expressions) are kept
// without a type and resolved against the accounts list at execution time.
function parseSchedulingEntityRefs(val) {
    const platforms = new Set(exports.SCHEDULING_PLATFORMS);
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
// The API documents slot hours as a plain hour-of-day string ("14"). Accept the
// documented shape plus "14:00" and a 12-hour "2 PM" variant, so an unexpected
// format degrades to no scheduled_at rather than silently scheduling 12 hours off.
function parseSlotHour(time) {
    var _a;
    const raw = String(time !== null && time !== void 0 ? time : '').trim();
    if (!raw)
        return undefined;
    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match)
        return undefined;
    let hour = parseInt(match[1], 10);
    if (!Number.isFinite(hour))
        return undefined;
    const meridiem = (_a = match[3]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (meridiem) {
        if (hour < 1 || hour > 12)
            return undefined;
        if (meridiem === 'pm' && hour !== 12)
            hour += 12;
        if (meridiem === 'am' && hour === 12)
            hour = 0;
    }
    if (hour < 0 || hour > 23)
        return undefined;
    return hour;
}
function toScheduledAt(date, time) {
    var _a;
    // Tolerate a full ISO timestamp by taking the leading calendar date
    const day = (_a = (typeof date === 'string' ? date.trim() : '').match(/^(\d{4}-\d{2}-\d{2})/)) === null || _a === void 0 ? void 0 : _a[1];
    if (!day)
        return undefined;
    const hour = parseSlotHour(time);
    if (hour === undefined)
        return undefined;
    return `${day} ${String(hour).padStart(2, '0')}:00:00`;
}
function mapRecommendation(recommendation, meta, scope, extra) {
    var _a, _b, _c, _d, _e, _f, _g;
    const hour = parseSlotHour(recommendation === null || recommendation === void 0 ? void 0 : recommendation.time);
    const scheduledAt = toScheduledAt(recommendation === null || recommendation === void 0 ? void 0 : recommendation.date, recommendation === null || recommendation === void 0 ? void 0 : recommendation.time);
    return {
        scope,
        ...extra,
        rank: (_a = recommendation === null || recommendation === void 0 ? void 0 : recommendation.rank) !== null && _a !== void 0 ? _a : null,
        day: (_b = recommendation === null || recommendation === void 0 ? void 0 : recommendation.day) !== null && _b !== void 0 ? _b : null,
        date: (_c = recommendation === null || recommendation === void 0 ? void 0 : recommendation.date) !== null && _c !== void 0 ? _c : null,
        time: (_d = recommendation === null || recommendation === void 0 ? void 0 : recommendation.time) !== null && _d !== void 0 ? _d : null,
        hour: hour !== null && hour !== void 0 ? hour : null,
        score: (_e = recommendation === null || recommendation === void 0 ? void 0 : recommendation.score) !== null && _e !== void 0 ? _e : null,
        ...((recommendation === null || recommendation === void 0 ? void 0 : recommendation.platform_breakdown) ? { platform_breakdown: recommendation.platform_breakdown } : {}),
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        timezone: (_f = meta === null || meta === void 0 ? void 0 : meta.timezone) !== null && _f !== void 0 ? _f : null,
        generated_at: (_g = meta === null || meta === void 0 ? void 0 : meta.generated_at) !== null && _g !== void 0 ? _g : null,
    };
}
// Flatten an optimal-times response into one item per recommended slot, best-first.
// Slots carry a ready-to-use `scheduled_at` so they can be fed straight into a
// later Post → Create operation. Returns a single meta item when nothing ranked.
function flattenOptimalTimes(response, includeIndividual) {
    var _a, _b, _c;
    const meta = ((response === null || response === void 0 ? void 0 : response.meta) && typeof response.meta === 'object') ? response.meta : {};
    const slots = [];
    const globalRecommendations = (_a = response === null || response === void 0 ? void 0 : response.global) === null || _a === void 0 ? void 0 : _a.top_recommendations;
    if (Array.isArray(globalRecommendations)) {
        for (const recommendation of globalRecommendations) {
            slots.push(mapRecommendation(recommendation, meta, 'global', {}));
        }
    }
    const individual = response === null || response === void 0 ? void 0 : response.individual;
    if (includeIndividual && individual && typeof individual === 'object') {
        for (const [accountId, account] of Object.entries(individual)) {
            const recommendations = account === null || account === void 0 ? void 0 : account.top_recommendations;
            if (!Array.isArray(recommendations))
                continue;
            for (const recommendation of recommendations) {
                slots.push(mapRecommendation(recommendation, meta, 'account', {
                    account_id: accountId,
                    platform: (_b = account === null || account === void 0 ? void 0 : account.platform) !== null && _b !== void 0 ? _b : null,
                    source: (_c = account === null || account === void 0 ? void 0 : account.source) !== null && _c !== void 0 ? _c : null,
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
function parseMediaImages(val) {
    if (val && typeof val === 'object' && 'images' in val) {
        const images = val.images;
        if (Array.isArray(images)) {
            return images.map((img) => img === null || img === void 0 ? void 0 : img.url).filter(Boolean);
        }
    }
    return parseArray(val);
}
// Media video parser supporting fixedCollection and legacy string
function parseMediaVideo(val) {
    var _a;
    if (val && typeof val === 'object' && 'video' in val) {
        const video = val.video;
        if (video && typeof video === 'object' && 'url' in video) {
            return video.url || undefined;
        }
        if (Array.isArray(video) && video.length > 0) {
            return ((_a = video[0]) === null || _a === void 0 ? void 0 : _a.url) || undefined;
        }
    }
    if (typeof val === 'string') {
        return parseMaybeObject(val);
    }
    return undefined;
}
