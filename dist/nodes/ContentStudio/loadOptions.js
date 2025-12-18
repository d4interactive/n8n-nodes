"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirstCommentAccounts = getFirstCommentAccounts;
exports.getWorkspaces = getWorkspaces;
exports.getPosts = getPosts;
exports.getAccounts = getAccounts;
const utils_1 = require("./utils");
const ContentStudioApi_credentials_1 = require("../../credentials/ContentStudioApi.credentials");
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
function normalizeHttpResponse(res) {
    // n8n helpers.httpRequest can return either the response body directly (common)
    // or a full response object (depending on implementation/options).
    if (res && typeof res === 'object' && 'body' in res && 'statusCode' in res) {
        return { statusCode: res.statusCode, body: res.body };
    }
    return { statusCode: res === null || res === void 0 ? void 0 : res.statusCode, body: res };
}
async function httpRequestNormalized(ctx, options) {
    return normalizeHttpResponse(await ctx.helpers.httpRequest(options));
}
function extractListFromBody(body) {
    return Array.isArray(body) ? body : ((body === null || body === void 0 ? void 0 : body.data) || []);
}
function extractHttpErrorDetails(error) {
    var _a, _b, _c, _d, _e;
    const statusCode = (error === null || error === void 0 ? void 0 : error.statusCode) || ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.statusCode) || ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.status) || 'unknown';
    const body = (_d = (_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.body) !== null && _d !== void 0 ? _d : (_e = error === null || error === void 0 ? void 0 : error.response) === null || _e === void 0 ? void 0 : _e.data;
    const apiMessage = extractApiErrorMessage(body) || (error === null || error === void 0 ? void 0 : error.message) || String(error);
    return { statusCode, apiMessage };
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
    try {
        const credentials = await this.getCredentials('contentStudioApi');
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudioApi_credentials_1.BASE_URL);
        const apiKey = credentials.apiKey;
        const workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const selectedRaw = this.getCurrentNodeParameter('accounts');
        const selectedIds = Array.from(new Set(parseSelectedAccountIds(selectedRaw)));
        if (selectedIds.length === 0)
            return [];
        const selectedSet = new Set(selectedIds);
        const baseQsAll = { page: 1, per_page: 100 };
        const baseQsSelected = { page: 1, per_page: Math.min(Math.max(selectedIds.length, 1), 100) };
        const idsCsv = selectedIds.join(',');
        const qsWithIds = {
            ...baseQsSelected,
            ids: idsCsv,
        };
        const optionsBase = {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            simple: false,
            resolveWithFullResponse: true,
            timeout: 60000,
        };
        let { statusCode, body } = await httpRequestNormalized(this, { ...optionsBase, qs: qsWithIds });
        if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
            ({ statusCode, body } = await httpRequestNormalized(this, { ...optionsBase, qs: baseQsAll }));
        }
        if (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300)) {
            const apiMessage = extractApiErrorMessage(body);
            throw new Error(`Failed to load First Comment Accounts: (${statusCode}) ${apiMessage || 'Request failed'}`);
        }
        const list = extractListFromBody(body);
        const out = list
            .filter((a) => {
            const id = a === null || a === void 0 ? void 0 : a._id;
            return id && selectedSet.has(String(id));
        })
            .map(formatAccountOption)
            .filter((o) => !!o);
        return out;
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load First Comment Accounts: (${statusCode}) ${apiMessage}`);
    }
}
async function getWorkspaces() {
    try {
        const credentials = await this.getCredentials('contentStudioApi');
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudioApi_credentials_1.BASE_URL);
        const apiKey = credentials.apiKey;
        const options = {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            simple: false,
            resolveWithFullResponse: true,
            timeout: 60000,
        };
        const res = await this.helpers.httpRequest(options);
        const { statusCode, body } = normalizeHttpResponse(res);
        if (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300)) {
            const apiMessage = extractApiErrorMessage(body);
            throw new Error(`Failed to load Workspaces: (${statusCode}) ${apiMessage || 'Request failed'}`);
        }
        const list = (body === null || body === void 0 ? void 0 : body.data) || [];
        const out = list
            .map((w) => {
            const id = w === null || w === void 0 ? void 0 : w._id;
            if (!id)
                return null;
            const name = (w === null || w === void 0 ? void 0 : w.name) || (w === null || w === void 0 ? void 0 : w.title) || id;
            return { name, value: id };
        })
            .filter((o) => !!o);
        return out;
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        throw new Error(`Failed to load Workspaces: (${statusCode}) ${apiMessage}`);
    }
}
async function getPosts() {
    try {
        const credentials = await this.getCredentials('contentStudioApi');
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudioApi_credentials_1.BASE_URL);
        const apiKey = credentials.apiKey;
        const workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const options = {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/posts`,
            qs: { page: 1, per_page: 50 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
        };
        const res = await this.helpers.httpRequest(options);
        const list = (res === null || res === void 0 ? void 0 : res.data) || [];
        const out = list
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
        return out;
    }
    catch (error) {
        const msg = (error === null || error === void 0 ? void 0 : error.message) || String(error);
        throw new Error(`Failed to load Posts: ${msg}`);
    }
}
async function getAccounts() {
    let workspaceId = '';
    try {
        const credentials = await this.getCredentials('contentStudioApi');
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudioApi_credentials_1.BASE_URL);
        const apiKey = credentials.apiKey;
        workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const options = {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            simple: false,
            resolveWithFullResponse: true,
            timeout: 60000,
        };
        const res = await this.helpers.httpRequest(options);
        const normalized = normalizeHttpResponse(res);
        const statusCode = normalized.statusCode;
        const body = normalized.body;
        if (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300)) {
            const apiMessage = extractApiErrorMessage(body);
            const hint = statusCode === 403
                ? ' Forbidden: this API key user likely does not have access to Social Accounts in this workspace. Try a different workspaceId or adjust workspace/team permissions.'
                : '';
            throw new Error(`Failed to load Accounts for workspace ${workspaceId}: (${statusCode}) ${apiMessage || 'Request failed'}${hint}`);
        }
        const list = (body === null || body === void 0 ? void 0 : body.data) || [];
        const out = list
            .map(formatAccountOption)
            .filter((o) => !!o);
        return out;
    }
    catch (error) {
        const { statusCode, apiMessage } = extractHttpErrorDetails(error);
        const hint = statusCode === 403
            ? ' Forbidden: this API key user likely does not have access to Social Accounts in this workspace. Try a different workspaceId or adjust workspace/team permissions.'
            : '';
        throw new Error(`Failed to load Accounts for workspace ${workspaceId}: (${statusCode}) ${apiMessage}${hint}`);
    }
}
