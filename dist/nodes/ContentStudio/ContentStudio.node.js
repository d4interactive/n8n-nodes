"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStudio = void 0;
const loadOptions_1 = require("./loadOptions");
const utils_1 = require("./utils");
const ContentStudio_credentials_1 = require("../../credentials/ContentStudio.credentials");
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
    var _a, _b, _c, _d, _e, _f;
    const statusCode = (error === null || error === void 0 ? void 0 : error.statusCode) ||
        ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.statusCode) ||
        ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.status) ||
        ((_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.statusText) ||
        'unknown';
    const body = (_e = (_d = error === null || error === void 0 ? void 0 : error.response) === null || _d === void 0 ? void 0 : _d.body) !== null && _e !== void 0 ? _e : (_f = error === null || error === void 0 ? void 0 : error.response) === null || _f === void 0 ? void 0 : _f.data;
    const apiMessage = extractApiErrorMessage(body) || (error === null || error === void 0 ? void 0 : error.message) || String(error);
    return { statusCode, apiMessage };
}
class ContentStudio {
    constructor() {
        this.description = {
            displayName: 'ContentStudio',
            name: 'contentStudio',
            group: ['transform'],
            version: [4, 5],
            description: 'Integrate with ContentStudio API',
            defaults: { name: 'ContentStudio' },
            iconUrl: '//app.contentstudio.io/favicons/favicon.ico',
            inputs: ['main'],
            outputs: ['main'],
            credentials: [{ name: 'contentStudio', required: true }],
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
                    displayName: 'Accounts',
                    name: 'accounts',
                    type: 'multiOptions',
                    typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
                    default: [],
                    required: true,
                    description: 'Select one or more social accounts to publish to',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
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
                    displayName: 'Post Type',
                    name: 'postType',
                    type: 'options',
                    options: [
                        { name: 'Feed', value: 'feed' },
                        { name: 'Feed + Reel', value: 'feed+reel' },
                        { name: 'Reel', value: 'reel' },
                        { name: 'Carousel', value: 'carousel' },
                        { name: 'Story', value: 'story' },
                        { name: 'Feed + Story', value: 'feed+story' },
                        { name: 'Feed + Reel + Story', value: 'feed+reel+story' },
                        { name: 'Reel + Story', value: 'reel+story' },
                        { name: 'Carousel + Story', value: 'carousel+story' },
                        { name: 'Video', value: 'video' },
                        { name: 'Shorts', value: 'shorts' }
                    ],
                    default: 'feed',
                    description: 'Type of post to create',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Publish Type',
                    name: 'publishType',
                    type: 'options',
                    options: [
                        { name: 'Scheduled', value: 'scheduled' },
                        { name: 'Queued', value: 'queued' },
                        { name: 'Draft', value: 'draft' },
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
                    displayOptions: { show: { resource: ['post'], operation: ['create'], publishType: ['scheduled'] } },
                },
                {
                    displayName: 'Enable First Comment',
                    name: 'hasFirstComment',
                    type: 'boolean',
                    default: false,
                    description: 'Whether to add a first comment to the post',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Comment Message',
                    name: 'firstCommentMessage',
                    type: 'string',
                    required: true,
                    default: '',
                    placeholder: 'Enter your first comment...',
                    description: 'The message to post as the first comment',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], hasFirstComment: [true] } },
                },
                {
                    displayName: 'Comment Accounts',
                    name: 'firstCommentAccounts',
                    type: 'multiOptions',
                    typeOptions: { loadOptionsMethod: 'getFirstCommentAccounts', loadOptionsDependsOn: ['workspaceId', 'accounts'] },
                    required: true,
                    default: [],
                    description: 'Select accounts to add the first comment',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], hasFirstComment: [true] } },
                },
            ],
        };
        // Dynamic dropdowns
        this.methods = {
            loadOptions: {
                getWorkspaces: loadOptions_1.getWorkspaces,
                getPosts: loadOptions_1.getPosts,
                getAccounts: loadOptions_1.getAccounts,
                getFirstCommentAccounts: loadOptions_1.getFirstCommentAccounts,
            },
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            const resource = this.getNodeParameter('resource', i);
            const operation = this.getNodeParameter('operation', i);
            const credentials = await this.getCredentials('contentStudio');
            const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
            const apiKey = credentials.apiKey;
            // Base request options
            const options = {
                method: 'GET',
                url: '',
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
                options.url = `${baseRoot}/v1/me`;
            }
            if (resource === 'workspace' && operation === 'list') {
                const page = this.getNodeParameter('page', i);
                const perPage = this.getNodeParameter('perPage', i);
                options.method = 'GET';
                options.url = `${baseRoot}/v1/workspaces`;
                options.qs = { page, per_page: perPage };
            }
            if (resource === 'socialAccount' && operation === 'list') {
                const workspaceId = this.getNodeParameter('workspaceId', i);
                const page = this.getNodeParameter('page', i);
                const perPage = this.getNodeParameter('perPage', i);
                const platform = this.getNodeParameter('platform', i) || undefined;
                options.method = 'GET';
                options.url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
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
                options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
                options.qs = qs;
            }
            if (resource === 'post' && operation === 'create') {
                const workspaceId = this.getNodeParameter('workspaceId', i);
                const contentText = this.getNodeParameter('contentText', i) || '';
                const mediaImagesParam = this.getNodeParameter('mediaImages', i);
                const mediaVideoParam = this.getNodeParameter('mediaVideo', i) || '';
                const accountsParam = this.getNodeParameter('accounts', i);
                const postType = this.getNodeParameter('postType', i) || 'feed';
                const publishType = this.getNodeParameter('publishType', i) || 'scheduled';
                // Get scheduled_at only if publish_type is 'scheduled'
                let scheduledAt = '';
                if (publishType === 'scheduled') {
                    scheduledAt = this.getNodeParameter('scheduledAt', i) || '';
                }
                else {
                    // Auto-generate scheduled_at as now + 90 minutes for queued/draft
                    const futureDate = new Date(Date.now() + 90 * 60 * 1000);
                    const year = futureDate.getFullYear();
                    const month = String(futureDate.getMonth() + 1).padStart(2, '0');
                    const day = String(futureDate.getDate()).padStart(2, '0');
                    const hours = String(futureDate.getHours()).padStart(2, '0');
                    const minutes = String(futureDate.getMinutes()).padStart(2, '0');
                    const seconds = String(futureDate.getSeconds()).padStart(2, '0');
                    scheduledAt = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                }
                // First comment fields
                const hasFirstComment = this.getNodeParameter('hasFirstComment', i, false);
                let firstCommentMessage = '';
                let firstCommentAccountIds = [];
                if (hasFirstComment) {
                    firstCommentMessage = this.getNodeParameter('firstCommentMessage', i) || '';
                    const firstCommentAccountsParam = this.getNodeParameter('firstCommentAccounts', i);
                    firstCommentAccountIds = (0, utils_1.parseAccounts)(firstCommentAccountsParam);
                    if (!firstCommentMessage.trim()) {
                        throw new Error('First Comment Message is required when Enable First Comment is true');
                    }
                    if (firstCommentAccountIds.length === 0) {
                        throw new Error('First Comment Accounts is required when Enable First Comment is true');
                    }
                }
                const mediaImages = (0, utils_1.parseMediaImages)(mediaImagesParam);
                const mediaVideo = (0, utils_1.parseMediaVideo)(mediaVideoParam);
                const accounts = (0, utils_1.parseAccounts)(accountsParam);
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
                // Validate first comment accounts overlap with main accounts
                if (hasFirstComment && firstCommentAccountIds.length > 0) {
                    const mainAccountSet = new Set(accounts);
                    const validCommentAccounts = firstCommentAccountIds.filter(id => mainAccountSet.has(id));
                    if (validCommentAccounts.length === 0) {
                        throw new Error('First Comment Accounts must include at least one account from the selected main Accounts');
                    }
                    // Use only valid overlapping accounts
                    firstCommentAccountIds = validCommentAccounts;
                }
                options.method = 'POST';
                options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
                options.body = {
                    content: {
                        text: contentText,
                        media: {
                            images: mediaImages,
                            video: mediaVideo,
                        },
                    },
                    accounts,
                    post_type: postType,
                    scheduling: {
                        publish_type: publishType,
                        scheduled_at: scheduledAt,
                    },
                };
                // Add first comment to body if enabled
                if (hasFirstComment && firstCommentMessage) {
                    options.body.first_comment = {
                        message: firstCommentMessage,
                        accounts: firstCommentAccountIds,
                    };
                }
            }
            if (resource === 'post' && operation === 'delete') {
                const workspaceId = this.getNodeParameter('workspaceId', i);
                const postId = this.getNodeParameter('postId', i);
                options.method = 'DELETE';
                options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}`;
            }
            try {
                const response = await this.helpers.httpRequest(options);
                returnData.push({ json: response });
            }
            catch (error) {
                const { statusCode, apiMessage } = extractHttpErrorDetails(error);
                throw new Error(`ContentStudio API Error (${statusCode}): ${apiMessage}`);
            }
        }
        return [returnData];
    }
}
exports.ContentStudio = ContentStudio;
