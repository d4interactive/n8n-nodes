"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkspaces = getWorkspaces;
exports.getPosts = getPosts;
exports.getAccounts = getAccounts;
const utils_1 = require("./utils");
const ContentStudioApi_credentials_1 = require("../../credentials/ContentStudioApi.credentials");
async function getWorkspaces() {
    try {
        const credentials = await this.getCredentials('contentStudioApi');
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudioApi_credentials_1.BASE_URL);
        const apiKey = credentials.apiKey;
        const options = {
            method: 'GET',
            uri: `${baseRoot}/v1/workspaces`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
        };
        const res = await this.helpers.request(options);
        const list = (res === null || res === void 0 ? void 0 : res.data) || [];
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
        const msg = (error === null || error === void 0 ? void 0 : error.message) || String(error);
        throw new Error(`Failed to load Workspaces: ${msg}`);
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
            uri: `${baseRoot}/v1/workspaces/${workspaceId}/posts`,
            qs: { page: 1, per_page: 50 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
        };
        const res = await this.helpers.request(options);
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
    try {
        const credentials = await this.getCredentials('contentStudioApi');
        const baseRoot = (0, utils_1.normalizeBase)(ContentStudioApi_credentials_1.BASE_URL);
        const apiKey = credentials.apiKey;
        const workspaceId = this.getCurrentNodeParameter('workspaceId') || '';
        if (!workspaceId)
            return [];
        const options = {
            method: 'GET',
            uri: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
        };
        const res = await this.helpers.request(options);
        const list = (res === null || res === void 0 ? void 0 : res.data) || [];
        const out = list
            .map((a) => {
            const id = a === null || a === void 0 ? void 0 : a._id;
            if (!id)
                return null;
            const platform = (a === null || a === void 0 ? void 0 : a.platform) || (a === null || a === void 0 ? void 0 : a.provider) || '';
            const accountName = (a === null || a === void 0 ? void 0 : a.account_name) || (a === null || a === void 0 ? void 0 : a.username) || (a === null || a === void 0 ? void 0 : a.handle) || (a === null || a === void 0 ? void 0 : a.name) || '';
            const label = [platform, accountName]
                .filter(Boolean)
                .join(' - ') || String(id);
            return { name: label, value: id };
        })
            .filter((o) => !!o);
        return out;
    }
    catch (error) {
        const msg = (error === null || error === void 0 ? void 0 : error.message) || String(error);
        throw new Error(`Failed to load Accounts: ${msg}`);
    }
}
