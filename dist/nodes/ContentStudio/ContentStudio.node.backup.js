"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStudio = void 0;
class ContentStudio {
    constructor() {
        this.description = {
            displayName: 'ContentStudio',
            name: 'contentStudio',
            group: ['transform'],
            version: [4, 5],
            description: 'Integrate with ContentStudio API',
            defaults: { name: 'ContentStudio' },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [{ name: 'contentStudioApi', required: true }],
            properties: [
                // Resource selector
                {
                    displayName: 'Resource',
                    name: 'resource',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        { name: 'Auth', value: 'auth' },
                        { name: 'Workspace', value: 'workspace' },
                        { name: 'Social Account', value: 'socialAccount' },
                        { name: 'Post', value: 'post' },
                    ],
                    default: 'auth',
                    required: true,
                },
                // Operation by resource
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['auth'] } },
                    options: [{ name: 'Validate Key', value: 'validateKey', action: 'Validate API key' }],
                    default: 'validateKey',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['workspace'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List workspaces' },
                    ],
                    default: 'list',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['socialAccount'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Social Accounts' },
                    ],
                    default: 'list',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['post'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Posts' },
                        { name: 'Create', value: 'create', action: 'Create Social Post' },
                        { name: 'Delete', value: 'delete', action: 'Delete Post' },
                    ],
                    default: 'list',
                },
                // Common params
                {
                    displayName: 'Workspace ID',
                    name: 'workspaceId',
                    type: 'options',
                    typeOptions: { loadOptionsMethod: 'getWorkspaces' },
                    default: '',
                    required: true,
                    description: 'Workspace ID',
                    displayOptions: {
                        show: {
                            resource: ['socialAccount', 'post'],
                        },
                    },
                },
                {
                    displayName: 'Page',
                    name: 'page',
                    type: 'number',
                    default: 1,
                    typeOptions: { minValue: 1 },
                    displayOptions: {
                        show: { resource: ['workspace', 'socialAccount', 'post'], operation: ['list'] },
                    },
                },
                {
                    displayName: 'Per Page',
                    name: 'perPage',
                    type: 'number',
                    default: 10,
                    typeOptions: { minValue: 1, maxValue: 100 },
                    displayOptions: {
                        show: { resource: ['workspace', 'socialAccount', 'post'], operation: ['list'] },
                    },
                },
                // Social accounts
                {
                    displayName: 'Platform',
                    name: 'platform',
                    type: 'string',
                    default: '',
                    description: 'Optional platform filter',
                    displayOptions: {
                        show: { resource: ['socialAccount'], operation: ['list'] },
                    },
                },
                // Posts list filters
                {
                    displayName: 'Statuses (CSV)',
                    name: 'statusesCsv',
                    type: 'string',
                    default: '',
                    description: 'Comma-separated statuses to filter by (e.g. scheduled,published,queued)',
                    displayOptions: {
                        show: { resource: ['post'], operation: ['list'] },
                    },
                },
                {
                    displayName: 'Date From',
                    name: 'dateFrom',
                    type: 'string',
                    default: '',
                    placeholder: 'YYYY-MM-DD',
                    displayOptions: {
                        show: { resource: ['post'], operation: ['list'] },
                    },
                },
                {
                    displayName: 'Date To',
                    name: 'dateTo',
                    type: 'string',
                    default: '',
                    placeholder: 'YYYY-MM-DD',
                    displayOptions: {
                        show: { resource: ['post'], operation: ['list'] },
                    },
                },
                // Posts create/delete
                {
                    displayName: 'Post ID',
                    name: 'postId',
                    type: 'string',
                    default: '',
                    required: true,
                    placeholder: 'Enter post ID',
                    description: 'The ID of the post to delete',
                    displayOptions: { show: { resource: ['post'], operation: ['delete'] } },
                },
                {
                    displayName: 'Content Text',
                    name: 'contentText',
                    type: 'string',
                    default: '',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Media Images',
                    name: 'mediaImages',
                    type: 'fixedCollection',
                    placeholder: 'Add Image URL',
                    default: {},
                    typeOptions: {
                        multipleValues: true,
                    },
                    options: [
                        {
                            name: 'images',
                            displayName: 'Images',
                            values: [
                                {
                                    displayName: 'Image URL',
                                    name: 'url',
                                    type: 'string',
                                    default: '',
                                    placeholder: 'https://example.com/image.jpg',
                                    description: 'URL of the image to include in the post',
                                },
                            ],
                        },
                    ],
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Media Video',
                    name: 'mediaVideo',
                    type: 'fixedCollection',
                    placeholder: 'Add Video URL',
                    default: {},
                    typeOptions: {
                        multipleValues: false,
                    },
                    options: [
                        {
                            name: 'video',
                            displayName: 'Video',
                            values: [
                                {
                                    displayName: 'Video URL',
                                    name: 'url',
                                    type: 'string',
                                    default: '',
                                    placeholder: 'https://example.com/video.mp4',
                                    description: 'URL of the video to include in the post',
                                },
                            ],
                        },
                    ],
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Accounts',
                    name: 'accounts',
                    type: 'multiOptions',
                    typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
                    default: [],
                    description: 'Select one or more social accounts to publish to',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Publish Type',
                    name: 'publishType',
                    type: 'options',
                    options: [
                        { name: 'Scheduled', value: 'scheduled' },
                    ],
                    default: 'scheduled',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Scheduled At',
                    name: 'scheduledAt',
                    type: 'string',
                    required: true,
                    default: '',
                    placeholder: '2025-10-11 11:15:00',
                    description: 'Schedule date and time in format: YYYY-MM-DD HH:MM:SS',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
            ],
        };
        // Dynamic dropdowns
        this.methods = {
            loadOptions: {
                async getWorkspaces() {
                    var _a, _b, _c, _d;
                    try {
                        const credentials = await this.getCredentials('contentStudioApi');
                        const normalizeBase = (u) => u.replace(/\/$/, '').replace(/\/v1$/, '');
                        const baseRoot = normalizeBase(credentials.baseUrl);
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
                        const candidates = [
                            (_a = res === null || res === void 0 ? void 0 : res.data) === null || _a === void 0 ? void 0 : _a.data,
                            (_b = res === null || res === void 0 ? void 0 : res.data) === null || _b === void 0 ? void 0 : _b.items,
                            (_c = res === null || res === void 0 ? void 0 : res.data) === null || _c === void 0 ? void 0 : _c.results,
                            (_d = res === null || res === void 0 ? void 0 : res.data) === null || _d === void 0 ? void 0 : _d.workspaces,
                            res === null || res === void 0 ? void 0 : res.data,
                            res === null || res === void 0 ? void 0 : res.workspaces,
                            res === null || res === void 0 ? void 0 : res.items,
                            res === null || res === void 0 ? void 0 : res.results,
                            res,
                        ];
                        const list = candidates.find((v) => Array.isArray(v)) || [];
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
                },
                async getPosts() {
                    var _a, _b, _c, _d;
                    try {
                        const credentials = await this.getCredentials('contentStudioApi');
                        const normalizeBase = (u) => u.replace(/\/$/, '').replace(/\/v1$/, '');
                        const baseRoot = normalizeBase(credentials.baseUrl);
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
                        const candidates = [
                            (_a = res === null || res === void 0 ? void 0 : res.data) === null || _a === void 0 ? void 0 : _a.data,
                            (_b = res === null || res === void 0 ? void 0 : res.data) === null || _b === void 0 ? void 0 : _b.items,
                            (_c = res === null || res === void 0 ? void 0 : res.data) === null || _c === void 0 ? void 0 : _c.results,
                            (_d = res === null || res === void 0 ? void 0 : res.data) === null || _d === void 0 ? void 0 : _d.posts,
                            res === null || res === void 0 ? void 0 : res.data,
                            res === null || res === void 0 ? void 0 : res.posts,
                            res === null || res === void 0 ? void 0 : res.items,
                            res === null || res === void 0 ? void 0 : res.results,
                            res,
                        ];
                        const list = candidates.find((v) => Array.isArray(v)) || [];
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
                },
                async getAccounts() {
                    var _a, _b, _c, _d;
                    try {
                        const credentials = await this.getCredentials('contentStudioApi');
                        const normalizeBase = (u) => u.replace(/\/$/, '').replace(/\/v1$/, '');
                        const baseRoot = normalizeBase(credentials.baseUrl);
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
                        const candidates = [
                            (_a = res === null || res === void 0 ? void 0 : res.data) === null || _a === void 0 ? void 0 : _a.data,
                            (_b = res === null || res === void 0 ? void 0 : res.data) === null || _b === void 0 ? void 0 : _b.items,
                            (_c = res === null || res === void 0 ? void 0 : res.data) === null || _c === void 0 ? void 0 : _c.results,
                            (_d = res === null || res === void 0 ? void 0 : res.data) === null || _d === void 0 ? void 0 : _d.accounts,
                            res === null || res === void 0 ? void 0 : res.data,
                            res === null || res === void 0 ? void 0 : res.accounts,
                            res === null || res === void 0 ? void 0 : res.items,
                            res === null || res === void 0 ? void 0 : res.results,
                            res,
                        ];
                        const list = candidates.find((v) => Array.isArray(v)) || [];
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
                },
            },
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            const resource = this.getNodeParameter('resource', i);
            const operation = this.getNodeParameter('operation', i);
            const credentials = await this.getCredentials('contentStudioApi');
            const normalizeBase = (u) => u.replace(/\/$/, '').replace(/\/v1$/, '');
            const baseRoot = normalizeBase(credentials.baseUrl);
            const apiKey = credentials.apiKey;
            // Base request options
            const options = {
                method: 'GET',
                uri: '',
                qs: {},
                body: {},
                json: true,
                headers: {
                    accept: 'application/json',
                    'X-API-Key': apiKey,
                },
                timeout: 60000,
            };
            // Routes
            if (resource === 'auth' && operation === 'validateKey') {
                options.method = 'GET';
                options.uri = `${baseRoot}/v1/me`;
            }
            if (resource === 'workspace' && operation === 'list') {
                const page = this.getNodeParameter('page', i);
                const perPage = this.getNodeParameter('perPage', i);
                options.method = 'GET';
                options.uri = `${baseRoot}/v1/workspaces`;
                options.qs = { page, per_page: perPage };
            }
            if (resource === 'socialAccount' && operation === 'list') {
                const workspaceId = this.getNodeParameter('workspaceId', i);
                const page = this.getNodeParameter('page', i);
                const perPage = this.getNodeParameter('perPage', i);
                const platform = this.getNodeParameter('platform', i) || undefined;
                options.method = 'GET';
                options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
                options.qs = { page, per_page: perPage };
                if (platform)
                    options.qs.platform = platform;
            }
            if (resource === 'post' && operation === 'list') {
                const workspaceId = this.getNodeParameter('workspaceId', i);
                const page = this.getNodeParameter('page', i);
                const perPage = this.getNodeParameter('perPage', i);
                const statusesCsv = this.getNodeParameter('statusesCsv', i) || '';
                const dateFrom = this.getNodeParameter('dateFrom', i) || '';
                const dateTo = this.getNodeParameter('dateTo', i) || '';
                const qs = { page, per_page: perPage };
                const statuses = Array.from(new Set(statusesCsv.split(',').map(s => s.trim()).filter(Boolean)));
                statuses.forEach((s) => {
                    if (!qs['status[]'])
                        qs['status[]'] = [];
                    qs['status[]'].push(s);
                });
                if (dateFrom)
                    qs.date_from = dateFrom;
                if (dateTo)
                    qs.date_to = dateTo;
                options.method = 'GET';
                options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
                options.qs = qs;
            }
            if (resource === 'post' && operation === 'create') {
                const workspaceId = this.getNodeParameter('workspaceId', i);
                const contentText = this.getNodeParameter('contentText', i) || '';
                const mediaImagesParam = this.getNodeParameter('mediaImages', i);
                const mediaVideoParam = this.getNodeParameter('mediaVideo', i) || '';
                const accountsParam = this.getNodeParameter('accounts', i);
                const publishType = this.getNodeParameter('publishType', i) || 'scheduled';
                const scheduledAt = this.getNodeParameter('scheduledAt', i) || '';
                const parseArray = (val) => {
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
                };
                const parseAccounts = (val) => {
                    // Handle multiOptions dropdown (already an array)
                    if (Array.isArray(val)) {
                        return val.filter(Boolean); // Remove any null/undefined values
                    }
                    // Fallback to parseArray for backward compatibility with JSON strings
                    return parseArray(val);
                };
                const parseMaybeObject = (val) => {
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
                };
                const parseMediaImages = (val) => {
                    // Handle new simplified collection format
                    if (val && typeof val === 'object' && 'images' in val) {
                        const images = val.images;
                        if (Array.isArray(images)) {
                            return images.map((img) => img === null || img === void 0 ? void 0 : img.url).filter(Boolean);
                        }
                    }
                    // Fallback to old JSON string format for backward compatibility
                    return parseArray(val);
                };
                const parseMediaVideo = (val) => {
                    var _a;
                    // Handle new collection format
                    if (val && typeof val === 'object' && 'video' in val) {
                        const video = val.video;
                        // Check if video is an object with url property
                        if (video && typeof video === 'object' && 'url' in video) {
                            return video.url || undefined;
                        }
                        // Check if video is an array (fallback)
                        if (Array.isArray(video) && video.length > 0) {
                            return ((_a = video[0]) === null || _a === void 0 ? void 0 : _a.url) || undefined;
                        }
                    }
                    // Fallback to old string format for backward compatibility
                    if (typeof val === 'string') {
                        return parseMaybeObject(val);
                    }
                    return undefined;
                };
                const mediaImages = parseMediaImages(mediaImagesParam);
                const mediaVideo = parseMediaVideo(mediaVideoParam);
                const accounts = parseAccounts(accountsParam);
                // Content validation - ensure at least one content type is present
                const hasText = contentText && contentText.trim().length > 0;
                const hasImages = mediaImages && mediaImages.length > 0;
                const hasVideo = mediaVideo && mediaVideo.trim().length > 0;
                if (!hasText && !hasImages && !hasVideo) {
                    throw new Error('At least one of the following must be provided: Content Text, Media Images, or Media Video');
                }
                // Validate scheduled date format
                if (scheduledAt && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(scheduledAt)) {
                    throw new Error('Scheduled At must be in format: YYYY-MM-DD HH:MM:SS (e.g., 2025-10-11 11:15:00)');
                }
                options.method = 'POST';
                options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
                options.body = {
                    content: {
                        text: contentText,
                        media: {
                            images: mediaImages,
                            video: mediaVideo,
                        },
                    },
                    accounts,
                    scheduling: {
                        publish_type: publishType,
                        scheduled_at: scheduledAt || undefined,
                    },
                };
            }
            if (resource === 'post' && operation === 'delete') {
                const workspaceId = this.getNodeParameter('workspaceId', i);
                const postId = this.getNodeParameter('postId', i);
                options.method = 'DELETE';
                options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}`;
            }
            const response = await this.helpers.request(options);
            returnData.push({ json: response });
        }
        return [returnData];
    }
}
exports.ContentStudio = ContentStudio;
