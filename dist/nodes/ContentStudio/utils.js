"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBase = normalizeBase;
exports.parseArray = parseArray;
exports.parseAccounts = parseAccounts;
exports.parseMaybeObject = parseMaybeObject;
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
