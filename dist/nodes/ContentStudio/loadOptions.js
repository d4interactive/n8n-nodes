"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirstCommentAccounts = getFirstCommentAccounts;
exports.getWorkspaces = getWorkspaces;
exports.getPosts = getPosts;
exports.getAccounts = getAccounts;
exports.getContentCategories = getContentCategories;
exports.getFacebookBackgrounds = getFacebookBackgrounds;
exports.getTeamMembers = getTeamMembers;
const utils_1 = require("./utils");
const ContentStudio_credentials_1 = require("../../credentials/ContentStudio.credentials");
const CREDENTIALS_TYPE = 'contentStudio';
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function extractApiErrorMessage(body) {
    if (!body)
        return '';
    if (typeof body === 'string')
        return body;
    if (typeof body === 'object') {
        const b = body;
        return b.message || b.error || b.errors || safeStringify(b);
    }
    return String(body);
}
function extractHttpErrorDetails(error) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const statusCode = (error === null || error === void 0 ? void 0 : error.statusCode) || ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.statusCode) || ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.status) || 'unknown';
    const body = (_f = (_d = (_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.body) !== null && _d !== void 0 ? _d : (_e = error === null || error === void 0 ? void 0 : error.response) === null || _e === void 0 ? void 0 : _e.data) !== null && _f !== void 0 ? _f : (_h = (_g = error === null || error === void 0 ? void 0 : error.cause) === null || _g === void 0 ? void 0 : _g.response) === null || _h === void 0 ? void 0 : _h.data;
    const apiMessage = extractApiErrorMessage(body) || (error === null || error === void 0 ? void 0 : error.message) || String(error);
    return { statusCode, apiMessage };
}
async function apiRequest(ctx, options) {
    return ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIALS_TYPE, {
        headers: { accept: 'application/json' },
        json: true,
        timeout: 60000,
        ...options,
    });
}
function extractListFromBody(body) {
    return Array.isArray(body) ? body : ((body === null || body === void 0 ? void 0 : body.data) || []);
}
function formatAccountOption(a) {
    const id = a === null || a === void 0 ? void 0 : a._id;
    if (!id)
        return null;
    const platform = (a === null || a === void 0 ? void 0 : a.platform) || (a === null || a === void 0 ? void 0 : a.provider) || '';
    const accountName = (a === null || a === void 0 ? void 0 : a.account_name) || (a === null || a === void 0 ? void 0 : a.username) || (a === null || a === void 0 ? void 0 : a.handle) || (a === null || a === void 0 ? void 0 : a.name) || '';
    const label = [platform, accountName]
        .filter(Boolean)
        .join(' - ') || String(id);
    return { name: label, value: String(id) };
}
function parseSelectedAccountIds(val) {
    if (Array.isArray(val)) {
        return val.map((v) => String(v)).filter(Boolean);
    }
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t)
            return [];
        try {
            const parsed = JSON.parse(t);
            if (Array.isArray(parsed))
                return parsed.map((v) => String(v)).filter(Boolean);
        }
        catch {
            // ignore
        }
        return [t];
    }
    return [];
}
async function getFirstCommentAccounts() {
    var _a, _b;
    try {
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
        const workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const selectedRaw = this.getCurrentNodeParameter('accounts');
        const selectedIds = Array.from(new Set(parseSelectedAccountIds(selectedRaw)));
        if (selectedIds.length === 0)
            return [];
        const selectedSet = new Set(selectedIds);
        const url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
        let body;
        try {
            body = await apiRequest(this, {
                method: 'GET',
                url,
                qs: {
                    page: 1,
                    per_page: Math.min(Math.max(selectedIds.length, 1), 100),
                    ids: selectedIds.join(','),
                },
            });
        }
        catch (error) {
            const code = (error === null || error === void 0 ? void 0 : error.statusCode) || ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.statusCode) || ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.status);
            if (code === 400 || code === 404 || code === 422) {
                body = await apiRequest(this, {
                    method: 'GET',
                    url,
                    qs: { page: 1, per_page: 100 },
                });
            }
            else {
                throw error;
            }
        }
        const list = extractListFromBody(body);
        return list
            .filter((a) => {
            const id = a === null || a === void 0 ? void 0 : a._id;
            return id && selectedSet.has(String(id));
        })
            .map(formatAccountOption)
            .filter((o) => !!o);
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load First Comment Accounts: (${statusCode}) ${apiMessage}`);
    }
}
async function getWorkspaces() {
    try {
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
        const body = await apiRequest(this, {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces`,
            qs: { page: 1, per_page: 100 },
        });
        const list = (body === null || body === void 0 ? void 0 : body.data) || [];
        return list
            .map((w) => {
            const id = w === null || w === void 0 ? void 0 : w._id;
            if (!id)
                return null;
            const name = (w === null || w === void 0 ? void 0 : w.name) || (w === null || w === void 0 ? void 0 : w.title) || id;
            return { name, value: id };
        })
            .filter((o) => !!o);
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load Workspaces: (${statusCode}) ${apiMessage}`);
    }
}
async function getPosts() {
    try {
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
        const workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const body = await apiRequest(this, {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/posts`,
            qs: { page: 1, per_page: 50 },
        });
        const list = (body === null || body === void 0 ? void 0 : body.data) || [];
        return list
            .map((p) => {
            var _a;
            const id = p === null || p === void 0 ? void 0 : p._id;
            if (!id)
                return null;
            const text = (((_a = p === null || p === void 0 ? void 0 : p.content) === null || _a === void 0 ? void 0 : _a.text) || (p === null || p === void 0 ? void 0 : p.title) || '');
            const labelBase = `${(text || '').slice(0, 60)}${text && text.length > 60 ? '…' : ''}`.trim();
            const label = `${labelBase}${(p === null || p === void 0 ? void 0 : p.status) ? ` (${p.status})` : ''}` || String(id);
            return { name: label, value: id };
        })
            .filter((o) => !!o);
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load Posts: (${statusCode}) ${apiMessage}`);
    }
}
async function getAccounts() {
    let workspaceId = '';
    try {
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
        workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const body = await apiRequest(this, {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
            qs: { page: 1, per_page: 100 },
        });
        const list = (body === null || body === void 0 ? void 0 : body.data) || [];
        return list
            .map(formatAccountOption)
            .filter((o) => !!o);
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        const hint = statusCode === 403
            ? ' Forbidden: this API key user likely does not have access to Social Accounts in this workspace. Try a different workspaceId or adjust workspace/team permissions.'
            : '';
        throw new Error(`Failed to load Accounts for workspace ${workspaceId}: (${statusCode}) ${apiMessage}${hint}`);
    }
}
async function getContentCategories() {
    try {
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
        const workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const body = await apiRequest(this, {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/content-categories`,
            qs: { page: 1, per_page: 100 },
        });
        const list = extractListFromBody(body);
        return list
            .map((c) => {
            const id = c === null || c === void 0 ? void 0 : c._id;
            if (!id)
                return null;
            const name = (c === null || c === void 0 ? void 0 : c.name) || String(id);
            return { name, value: id };
        })
            .filter((o) => !!o);
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load Content Categories: (${statusCode}) ${apiMessage}`);
    }
}
async function getFacebookBackgrounds() {
    try {
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
        const body = await apiRequest(this, {
            method: 'GET',
            url: `${baseRoot}/v1/facebook/text-backgrounds`,
        });
        const list = extractListFromBody(body);
        const out = [];
        for (const p of list) {
            const id = p === null || p === void 0 ? void 0 : p.id;
            if (!id)
                continue;
            const desc = (p === null || p === void 0 ? void 0 : p.description) || String(id);
            const type = (p === null || p === void 0 ? void 0 : p.type) || '';
            const bg = (p === null || p === void 0 ? void 0 : p.background_color) || '';
            const label = type === 'image'
                ? `${desc} (image)`
                : (bg ? `${desc} — ${bg}` : desc);
            const hoverParts = [type, p === null || p === void 0 ? void 0 : p.category].filter(Boolean).join(' · ');
            out.push({ name: label, value: String(id), description: hoverParts });
        }
        return out;
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load Facebook Text Backgrounds: (${statusCode}) ${apiMessage}`);
    }
}
async function getTeamMembers() {
    try {
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
        const workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const body = await apiRequest(this, {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/team-members`,
            qs: { page: 1, per_page: 100 },
        });
        const list = extractListFromBody(body);
        return list
            .map((m) => {
            const id = m === null || m === void 0 ? void 0 : m._id;
            if (!id)
                return null;
            const name = (m === null || m === void 0 ? void 0 : m.name) || (m === null || m === void 0 ? void 0 : m.email) || String(id);
            const role = (m === null || m === void 0 ? void 0 : m.role) || '';
            const label = role ? `${name} (${role})` : name;
            return { name: label, value: id };
        })
            .filter((o) => !!o);
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load Team Members: (${statusCode}) ${apiMessage}`);
    }
}
