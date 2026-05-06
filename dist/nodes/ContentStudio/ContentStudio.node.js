"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStudio = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const loadOptions_1 = require("./loadOptions");
const utils_1 = require("./utils");
const ContentStudio_credentials_1 = require("../../credentials/ContentStudio.credentials");
const CREDENTIALS_TYPE = 'contentStudio';
function createThreadOptionsSection(enableName, displayName, optionsName, collectionName, useMediaList = false) {
    return [
        {
            displayName: `Enable ${displayName}`,
            name: enableName,
            type: 'boolean',
            default: false,
            description: `Whether to include ${displayName.toLowerCase()} in the post.`,
            displayOptions: { show: { resource: ['post'], operation: ['create'] } },
        },
        {
            displayName,
            name: optionsName,
            type: 'fixedCollection',
            placeholder: 'Add Thread Item',
            default: {
                [collectionName]: [
                    {
                        message: '',
                        ...(useMediaList ? { media: {} } : { image: {}, video: {} }),
                    },
                ],
            },
            typeOptions: {
                multipleValues: true,
            },
            options: [
                {
                    name: collectionName,
                    displayName: 'Thread Item',
                    values: [
                        {
                            displayName: 'Message',
                            name: 'message',
                            type: 'string',
                            default: '',
                            description: 'Thread message text',
                        },
                        {
                            displayName: useMediaList ? 'Media' : 'Image',
                            name: useMediaList ? 'media' : 'image',
                            type: 'fixedCollection',
                            placeholder: useMediaList ? 'Add Media URL' : 'Add Image URL',
                            default: {},
                            typeOptions: {
                                multipleValues: true,
                            },
                            options: [
                                {
                                    name: useMediaList ? 'media' : 'images',
                                    displayName: useMediaList ? 'Media' : 'Images',
                                    values: [
                                        {
                                            displayName: useMediaList ? 'Media URL' : 'Image URL',
                                            name: 'url',
                                            type: 'string',
                                            default: '',
                                            placeholder: useMediaList ? 'https://example.com/media.jpg' : 'https://example.com/image.jpg',
                                            description: useMediaList ? 'URL of the media to include in this thread item' : 'URL of the image to include in this thread item',
                                        },
                                    ],
                                },
                            ],
                        },
                        ...(useMediaList ? [] : [
                            {
                                displayName: 'Video',
                                name: 'video',
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
                                                description: 'URL of the video to include in this thread item',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ]),
                    ],
                },
            ],
            displayOptions: { show: { resource: ['post'], operation: ['create'], [enableName]: [true] } },
        },
    ];
}
function parseThreadOptions(value, collectionName) {
    if (!value || typeof value !== 'object') {
        return [];
    }
    const items = value[collectionName];
    if (!Array.isArray(items)) {
        return [];
    }
    const parsedItems = [];
    for (const item of items) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const threadItem = item;
        const message = typeof threadItem.message === 'string' ? threadItem.message.trim() : '';
        const media = parseThreadMediaList(threadItem);
        if (media.length > 0) {
            parsedItems.push({ message, media });
            continue;
        }
        const video = (0, utils_1.parseMediaVideo)(threadItem.video);
        parsedItems.push({
            message,
            image: (0, utils_1.parseMediaImages)(threadItem.image),
            ...(video ? { video } : {}),
        });
    }
    return parsedItems;
}
function parseThreadMediaList(threadItem) {
    const media = threadItem.media;
    if (media && typeof media === 'object' && 'media' in media) {
        const values = media.media;
        if (Array.isArray(values)) {
            return values.map((item) => item === null || item === void 0 ? void 0 : item.url).filter(Boolean);
        }
    }
    const legacyImages = (0, utils_1.parseMediaImages)(threadItem.image);
    const legacyVideo = (0, utils_1.parseMediaVideo)(threadItem.video);
    const legacyMediaIds = Array.isArray(threadItem.media_ids)
        ? threadItem.media_ids.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
        : [];
    return [...legacyImages, ...legacyMediaIds, ...(legacyVideo ? [legacyVideo] : [])];
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
            icon: 'file:contentstudio.png',
            subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
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
                        { name: 'Campaign', value: 'campaign' },
                        { name: 'Comment', value: 'comment' },
                        { name: 'Content Category', value: 'contentCategory' },
                        { name: 'Label', value: 'label' },
                        { name: 'Media', value: 'media' },
                        { name: 'Post', value: 'post' },
                        { name: 'Social Account', value: 'socialAccount' },
                        { name: 'Team Member', value: 'teamMember' },
                        { name: 'Workspace', value: 'workspace' },
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
                    displayOptions: { show: { resource: ['contentCategory'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Content Categories' },
                    ],
                    default: 'list',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['label'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Labels' },
                    ],
                    default: 'list',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['campaign'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Campaigns' },
                    ],
                    default: 'list',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['media'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Media' },
                        { name: 'Upload', value: 'upload', action: 'Upload Media' },
                    ],
                    default: 'list',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['teamMember'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Team Members' },
                    ],
                    default: 'list',
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['comment'] } },
                    options: [
                        { name: 'List', value: 'list', action: 'List Comments' },
                        { name: 'Create', value: 'create', action: 'Add Comment' },
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
                        { name: 'Approve/Reject', value: 'approve', action: 'Approve or Reject Post' },
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
                            resource: ['socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment'],
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
                        show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment'], operation: ['list'] },
                    },
                },
                {
                    displayName: 'Per Page',
                    name: 'perPage',
                    type: 'number',
                    default: 10,
                    typeOptions: { minValue: 1, maxValue: 100 },
                    displayOptions: {
                        show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment'], operation: ['list'] },
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
                // Label search
                {
                    displayName: 'Search',
                    name: 'labelSearch',
                    type: 'string',
                    default: '',
                    description: 'Optional search term to filter labels by name',
                    displayOptions: {
                        show: { resource: ['label'], operation: ['list'] },
                    },
                },
                // Campaign search
                {
                    displayName: 'Search',
                    name: 'campaignSearch',
                    type: 'string',
                    default: '',
                    description: 'Optional search term to filter campaigns by name',
                    displayOptions: {
                        show: { resource: ['campaign'], operation: ['list'] },
                    },
                },
                // Media list filters
                {
                    displayName: 'Media Type',
                    name: 'mediaType',
                    type: 'options',
                    options: [
                        { name: 'All', value: '' },
                        { name: 'Images', value: 'images' },
                        { name: 'Videos', value: 'videos' },
                    ],
                    default: '',
                    description: 'Filter by media type',
                    displayOptions: {
                        show: { resource: ['media'], operation: ['list'] },
                    },
                },
                {
                    displayName: 'Search',
                    name: 'mediaSearch',
                    type: 'string',
                    default: '',
                    description: 'Search media by name',
                    displayOptions: {
                        show: { resource: ['media'], operation: ['list'] },
                    },
                },
                {
                    displayName: 'Sort',
                    name: 'mediaSort',
                    type: 'options',
                    options: [
                        { name: 'Recent', value: 'recent' },
                        { name: 'Oldest', value: 'oldest' },
                        { name: 'Size', value: 'size' },
                        { name: 'A-Z', value: 'a2z' },
                        { name: 'Z-A', value: 'z2a' },
                    ],
                    default: 'recent',
                    description: 'Sort media results',
                    displayOptions: {
                        show: { resource: ['media'], operation: ['list'] },
                    },
                },
                // Media upload fields
                {
                    displayName: 'Media URL',
                    name: 'mediaUrl',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'URL of the image or video to import into the media library',
                    displayOptions: {
                        show: { resource: ['media'], operation: ['upload'] },
                    },
                },
                {
                    displayName: 'Folder ID',
                    name: 'mediaFolderId',
                    type: 'string',
                    default: '',
                    description: 'Optional folder ID to upload the media into',
                    displayOptions: {
                        show: { resource: ['media'], operation: ['upload'] },
                    },
                },
                // Team member search
                {
                    displayName: 'Search',
                    name: 'teamSearch',
                    type: 'string',
                    default: '',
                    description: 'Optional search term to filter team members by name or email',
                    displayOptions: {
                        show: { resource: ['teamMember'], operation: ['list'] },
                    },
                },
                // Comment fields
                {
                    displayName: 'Post ID',
                    name: 'commentPostId',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'The post ID to fetch comments for or add a comment to',
                    displayOptions: {
                        show: { resource: ['comment'] },
                    },
                },
                {
                    displayName: 'Comment Text',
                    name: 'commentText',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'The comment text to add',
                    displayOptions: {
                        show: { resource: ['comment'], operation: ['create'] },
                    },
                },
                {
                    displayName: 'Internal Note',
                    name: 'commentIsNote',
                    type: 'boolean',
                    default: false,
                    description: 'Whether this is an internal note (private, not visible to clients)',
                    displayOptions: {
                        show: { resource: ['comment'], operation: ['create'] },
                    },
                },
                {
                    displayName: 'Mentioned User IDs',
                    name: 'commentMentionedUsers',
                    type: 'string',
                    default: '',
                    description: 'Comma-separated user IDs to mention in the comment',
                    displayOptions: {
                        show: { resource: ['comment'], operation: ['create'] },
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
                {
                    displayName: 'Approval Assigned To',
                    name: 'approvalAssignedTo',
                    type: 'string',
                    default: '',
                    description: 'Filter by approver user IDs (comma-separated). Get IDs from the Team Member resource.',
                    displayOptions: {
                        show: { resource: ['post'], operation: ['list'] },
                    },
                },
                {
                    displayName: 'Approval Requested By',
                    name: 'approvalRequestedBy',
                    type: 'string',
                    default: '',
                    description: 'Filter by users who requested approval (comma-separated). Get IDs from the Team Member resource.',
                    displayOptions: {
                        show: { resource: ['post'], operation: ['list'] },
                    },
                },
                // Posts approve fields
                {
                    displayName: 'Post/Plan ID',
                    name: 'planId',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'The ID of the post (plan) to approve or reject. Get this from the Post List operation.',
                    displayOptions: { show: { resource: ['post'], operation: ['approve'] } },
                },
                {
                    displayName: 'Action',
                    name: 'approvalAction',
                    type: 'options',
                    options: [
                        { name: 'Approve', value: 'approve' },
                        { name: 'Reject', value: 'reject' },
                    ],
                    default: 'approve',
                    required: true,
                    description: 'Choose whether to approve or reject the post',
                    displayOptions: { show: { resource: ['post'], operation: ['approve'] } },
                },
                {
                    displayName: 'Comment',
                    name: 'approvalComment',
                    type: 'string',
                    default: '',
                    description: 'Optional comment for the approval or rejection',
                    displayOptions: { show: { resource: ['post'], operation: ['approve'] } },
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
                    required: false,
                    description: 'Select one or more social accounts to publish to. Optional if using Content Category (accounts will be merged from category).',
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
                ...createThreadOptionsSection('hasTwitterOptions', 'Twitter Options', 'twitterOptions', 'threadedTweets', true),
                ...createThreadOptionsSection('hasThreadsOptions', 'Threads Options', 'threadsOptions', 'multiThreads', true),
                {
                    displayName: 'Enable Facebook Options',
                    name: 'hasFacebookBackground',
                    type: 'boolean',
                    default: false,
                    description: 'Whether to add Facebook-specific options (e.g. a colored/gradient/image background for a plain-text Facebook post). Only applies to Facebook accounts on text-only posts.',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Facebook Text-Post Background',
                    name: 'facebookBackgroundId',
                    type: 'options',
                    typeOptions: { loadOptionsMethod: 'getFacebookBackgrounds' },
                    default: '',
                    required: false,
                    description: 'Pick a background preset. The backend rejects the post if images or video are attached.',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], hasFacebookBackground: [true] } },
                },
                {
                    displayName: 'Publish Type',
                    name: 'publishType',
                    type: 'options',
                    options: [
                        { name: 'Scheduled', value: 'scheduled' },
                        { name: 'Queued', value: 'queued' },
                        { name: 'Draft', value: 'draft' },
                        { name: 'Content Category', value: 'content_category' },
                    ],
                    default: 'scheduled',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Content Category',
                    name: 'contentCategoryId',
                    type: 'options',
                    typeOptions: { loadOptionsMethod: 'getContentCategories', loadOptionsDependsOn: ['workspaceId'] },
                    default: '',
                    required: true,
                    description: 'Select a content category. Accounts from the category will be used if no accounts are selected.',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], publishType: ['content_category'] } },
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
                    required: false,
                    default: [],
                    description: 'Select accounts to add the first comment. Optional if using Content Category (accounts will be merged from category).',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], hasFirstComment: [true] } },
                },
                // Post create — approval fields
                {
                    displayName: 'Send for Approval',
                    name: 'sendForApproval',
                    type: 'boolean',
                    default: false,
                    description: 'Whether to send this post for approval before publishing',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Approver IDs',
                    name: 'approvers',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'Comma-separated user IDs of team members who can approve. Get IDs from the Team Member resource.',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], sendForApproval: [true] } },
                },
                {
                    displayName: 'Approval Mode',
                    name: 'approveOption',
                    type: 'options',
                    options: [
                        { name: 'Anyone', value: 'anyone' },
                        { name: 'Everyone', value: 'everyone' },
                    ],
                    default: 'anyone',
                    description: '"Anyone" = any single approver can approve. "Everyone" = all approvers must approve.',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], sendForApproval: [true] } },
                },
                {
                    displayName: 'Notes for Approvers',
                    name: 'approvalNotes',
                    type: 'string',
                    default: '',
                    description: 'Optional notes for the approvers',
                    displayOptions: { show: { resource: ['post'], operation: ['create'], sendForApproval: [true] } },
                },
                // Post create — labels & campaign
                {
                    displayName: 'Label IDs',
                    name: 'labels',
                    type: 'string',
                    default: '',
                    description: 'Comma-separated label IDs to assign to the post. Get IDs from the Label resource. Max 20.',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
                },
                {
                    displayName: 'Campaign ID',
                    name: 'campaignId',
                    type: 'string',
                    default: '',
                    description: 'Campaign ID to assign the post to. Get the ID from the Campaign resource.',
                    displayOptions: { show: { resource: ['post'], operation: ['create'] } },
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
                getContentCategories: loadOptions_1.getContentCategories,
                getTeamMembers: loadOptions_1.getTeamMembers,
                getFacebookBackgrounds: loadOptions_1.getFacebookBackgrounds,
            },
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            try {
                const resource = this.getNodeParameter('resource', i);
                const operation = this.getNodeParameter('operation', i);
                const baseRoot = (0, utils_1.normalizeBase)(ContentStudio_credentials_1.BASE_URL);
                // Base request options
                const options = {
                    method: 'GET',
                    url: '',
                    qs: {},
                    body: {},
                    json: true,
                    headers: { accept: 'application/json' },
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
                if (resource === 'contentCategory' && operation === 'list') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const page = this.getNodeParameter('page', i);
                    const perPage = this.getNodeParameter('perPage', i);
                    options.method = 'GET';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories`;
                    options.qs = { page, per_page: perPage };
                }
                if (resource === 'label' && operation === 'list') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const page = this.getNodeParameter('page', i);
                    const perPage = this.getNodeParameter('perPage', i);
                    const search = this.getNodeParameter('labelSearch', i) || '';
                    options.method = 'GET';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels`;
                    const qs = { page, per_page: perPage };
                    if (search)
                        qs.search = search;
                    options.qs = qs;
                }
                if (resource === 'campaign' && operation === 'list') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const page = this.getNodeParameter('page', i);
                    const perPage = this.getNodeParameter('perPage', i);
                    const search = this.getNodeParameter('campaignSearch', i) || '';
                    options.method = 'GET';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns`;
                    const qs = { page, per_page: perPage };
                    if (search)
                        qs.search = search;
                    options.qs = qs;
                }
                if (resource === 'media' && operation === 'list') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const page = this.getNodeParameter('page', i);
                    const perPage = this.getNodeParameter('perPage', i);
                    const mediaType = this.getNodeParameter('mediaType', i) || '';
                    const search = this.getNodeParameter('mediaSearch', i) || '';
                    const sort = this.getNodeParameter('mediaSort', i) || 'recent';
                    options.method = 'GET';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/media`;
                    const qs = { page, per_page: perPage };
                    if (mediaType)
                        qs.type = mediaType;
                    if (search)
                        qs.search = search;
                    if (sort)
                        qs.sort = sort;
                    options.qs = qs;
                }
                if (resource === 'media' && operation === 'upload') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const mediaUrl = this.getNodeParameter('mediaUrl', i);
                    const folderId = this.getNodeParameter('mediaFolderId', i) || '';
                    if (!mediaUrl)
                        throw new Error('Media URL is required');
                    options.method = 'POST';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/media`;
                    options.body = { url: mediaUrl };
                    if (folderId)
                        options.body.folder_id = folderId;
                }
                if (resource === 'teamMember' && operation === 'list') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const page = this.getNodeParameter('page', i);
                    const perPage = this.getNodeParameter('perPage', i);
                    const search = this.getNodeParameter('teamSearch', i) || '';
                    options.method = 'GET';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members`;
                    const qs = { page, per_page: perPage };
                    if (search)
                        qs.search = search;
                    options.qs = qs;
                }
                if (resource === 'comment' && operation === 'list') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const postId = this.getNodeParameter('commentPostId', i);
                    const page = this.getNodeParameter('page', i);
                    const perPage = this.getNodeParameter('perPage', i);
                    if (!postId)
                        throw new Error('Post ID is required');
                    options.method = 'GET';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}/comments`;
                    options.qs = { page, per_page: perPage };
                }
                if (resource === 'comment' && operation === 'create') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const postId = this.getNodeParameter('commentPostId', i);
                    const commentText = this.getNodeParameter('commentText', i);
                    const isNote = this.getNodeParameter('commentIsNote', i, false);
                    const mentionedUsersRaw = this.getNodeParameter('commentMentionedUsers', i) || '';
                    if (!postId)
                        throw new Error('Post ID is required');
                    if (!commentText)
                        throw new Error('Comment text is required');
                    options.method = 'POST';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}/comments`;
                    const body = { comment: commentText };
                    if (isNote)
                        body.is_note = true;
                    if (mentionedUsersRaw.trim()) {
                        body.mentioned_users = mentionedUsersRaw.split(',').map(s => s.trim()).filter(Boolean);
                    }
                    options.body = body;
                }
                if (resource === 'post' && operation === 'list') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const page = this.getNodeParameter('page', i);
                    const perPage = this.getNodeParameter('perPage', i);
                    const statusesCsv = this.getNodeParameter('statusesCsv', i) || '';
                    const dateFrom = this.getNodeParameter('dateFrom', i) || '';
                    const dateTo = this.getNodeParameter('dateTo', i) || '';
                    const approvalAssignedTo = this.getNodeParameter('approvalAssignedTo', i, '') || '';
                    const approvalRequestedBy = this.getNodeParameter('approvalRequestedBy', i, '') || '';
                    // Build query string manually to ensure proper array format
                    const qsParts = [`page=${page}`, `per_page=${perPage}`];
                    const statuses = Array.from(new Set(statusesCsv.split(',').map(s => s.trim()).filter(Boolean)));
                    statuses.forEach((s) => qsParts.push(`status[]=${encodeURIComponent(s)}`));
                    if (dateFrom)
                        qsParts.push(`date_from=${encodeURIComponent(dateFrom)}`);
                    if (dateTo)
                        qsParts.push(`date_to=${encodeURIComponent(dateTo)}`);
                    if (approvalAssignedTo.trim()) {
                        approvalAssignedTo.split(',')
                            .map(s => s.trim().replace(/^["']+|["']+$/g, '').trim())
                            .filter(Boolean)
                            .forEach((id) => qsParts.push(`approval_assigned_to[]=${encodeURIComponent(id)}`));
                    }
                    if (approvalRequestedBy.trim()) {
                        approvalRequestedBy.split(',')
                            .map(s => s.trim().replace(/^["']+|["']+$/g, '').trim())
                            .filter(Boolean)
                            .forEach((id) => qsParts.push(`approval_requested_by[]=${encodeURIComponent(id)}`));
                    }
                    options.method = 'GET';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts?${qsParts.join('&')}`;
                }
                if (resource === 'post' && operation === 'create') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const contentText = this.getNodeParameter('contentText', i) || '';
                    const mediaImagesParam = this.getNodeParameter('mediaImages', i);
                    const mediaVideoParam = this.getNodeParameter('mediaVideo', i) || '';
                    const accountsParam = this.getNodeParameter('accounts', i);
                    const publishType = this.getNodeParameter('publishType', i) || 'scheduled';
                    // Get contentCategoryId when publish type is content_category
                    let contentCategoryId = '';
                    if (publishType === 'content_category') {
                        contentCategoryId = this.getNodeParameter('contentCategoryId', i) || '';
                    }
                    // Get scheduled_at only if publish_type is 'scheduled'
                    let scheduledAt = '';
                    if (publishType === 'scheduled') {
                        scheduledAt = this.getNodeParameter('scheduledAt', i) || '';
                    }
                    else {
                        // Auto-generate scheduled_at as now + 90 minutes for queued/draft/content_category
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
                        // First comment accounts required only when content_category is NOT used
                        if (firstCommentAccountIds.length === 0 && !contentCategoryId) {
                            throw new Error('First Comment Accounts is required when Enable First Comment is true and no Content Category is selected');
                        }
                    }
                    const mediaImages = (0, utils_1.parseMediaImages)(mediaImagesParam);
                    const mediaVideo = (0, utils_1.parseMediaVideo)(mediaVideoParam);
                    const accounts = (0, utils_1.parseAccounts)(accountsParam);
                    const hasTwitterOptions = this.getNodeParameter('hasTwitterOptions', i, false);
                    const hasThreadsOptions = this.getNodeParameter('hasThreadsOptions', i, false);
                    const twitterOptionsParam = this.getNodeParameter('twitterOptions', i, {});
                    const threadsOptionsParam = this.getNodeParameter('threadsOptions', i, {});
                    const twitterThreadItems = hasTwitterOptions ? parseThreadOptions(twitterOptionsParam, 'threadedTweets') : [];
                    const threadsThreadItems = hasThreadsOptions ? parseThreadOptions(threadsOptionsParam, 'multiThreads') : [];
                    // Validate: either accounts or content_category_id must be provided
                    if (accounts.length === 0 && !contentCategoryId) {
                        throw new Error('Either Accounts or Content Category must be selected');
                    }
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
                    // Validate first comment accounts overlap with main accounts (only if accounts provided)
                    if (hasFirstComment && firstCommentAccountIds.length > 0 && accounts.length > 0) {
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
                        scheduling: {
                            publish_type: publishType,
                            scheduled_at: scheduledAt,
                        },
                    };
                    if (hasTwitterOptions) {
                        options.body.twitter_options = {
                            has_threaded_tweets: true,
                            threaded_tweets: twitterThreadItems,
                        };
                    }
                    if (hasThreadsOptions) {
                        options.body.threads_options = {
                            has_multi_threads: true,
                            multi_threads: threadsThreadItems.map((threadItem) => {
                                var _a;
                                return ({
                                    message: threadItem.message,
                                    media: (_a = threadItem.media) !== null && _a !== void 0 ? _a : [],
                                });
                            }),
                        };
                    }
                    // Facebook text-post colored background (Facebook plain text posts only)
                    const hasFacebookBackground = this.getNodeParameter('hasFacebookBackground', i, false);
                    if (hasFacebookBackground) {
                        const facebookBackgroundId = this.getNodeParameter('facebookBackgroundId', i, '') || '';
                        if (facebookBackgroundId.trim()) {
                            options.body.facebook_options = {
                                facebook_background_id: facebookBackgroundId.trim(),
                            };
                        }
                    }
                    // Add content_category_id when publish type is content_category
                    if (publishType === 'content_category' && contentCategoryId) {
                        options.body.content_category_id = contentCategoryId;
                    }
                    // Add first comment to body if enabled
                    if (hasFirstComment && firstCommentMessage) {
                        options.body.first_comment = {
                            message: firstCommentMessage,
                            accounts: firstCommentAccountIds,
                        };
                    }
                    // Add approval if enabled
                    const sendForApproval = this.getNodeParameter('sendForApproval', i, false);
                    if (sendForApproval) {
                        const approversParam = this.getNodeParameter('approvers', i, '');
                        const approvers = (0, utils_1.parseCommaSeparated)(approversParam);
                        if (approvers.length === 0) {
                            throw new Error('At least one Approver ID is required when Send for Approval is enabled');
                        }
                        const approveOption = this.getNodeParameter('approveOption', i) || 'anyone';
                        const approvalNotes = this.getNodeParameter('approvalNotes', i) || '';
                        options.body.approval = {
                            approvers,
                            approve_option: approveOption,
                        };
                        if (approvalNotes) {
                            options.body.approval.notes = approvalNotes;
                        }
                    }
                    // Labels (handles string, array, JSON string from n8n expressions)
                    const labelsParam = this.getNodeParameter('labels', i, '');
                    const labels = (0, utils_1.parseCommaSeparated)(labelsParam);
                    if (labels.length > 0) {
                        options.body.labels = labels;
                    }
                    // Campaign
                    const campaignParam = this.getNodeParameter('campaignId', i, '');
                    const campaignId = Array.isArray(campaignParam) ? String(campaignParam[0] || '') : String(campaignParam || '');
                    if (campaignId.trim()) {
                        options.body.campaign_id = campaignId.trim();
                    }
                }
                if (resource === 'post' && operation === 'delete') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const postId = this.getNodeParameter('postId', i);
                    options.method = 'DELETE';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}`;
                }
                if (resource === 'post' && operation === 'approve') {
                    const workspaceId = this.getNodeParameter('workspaceId', i);
                    const planId = this.getNodeParameter('planId', i);
                    const approvalAction = this.getNodeParameter('approvalAction', i);
                    const comment = this.getNodeParameter('approvalComment', i) || '';
                    if (!planId)
                        throw new Error('Post/Plan ID is required');
                    if (!approvalAction)
                        throw new Error('Action is required (approve or reject)');
                    options.method = 'POST';
                    options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${planId}/approval`;
                    const approvalBody = { action: approvalAction };
                    if (comment) {
                        approvalBody.comment = comment;
                    }
                    options.body = approvalBody;
                }
                const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIALS_TYPE, options);
                returnData.push({ json: response, pairedItem: { item: i } });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    const message = (error === null || error === void 0 ? void 0 : error.message) || String(error);
                    returnData.push({ json: { error: message }, pairedItem: { item: i } });
                    continue;
                }
                if (error instanceof n8n_workflow_1.NodeApiError) {
                    throw error;
                }
                throw new n8n_workflow_1.NodeApiError(this.getNode(), error, { itemIndex: i });
            }
        }
        return [returnData];
    }
}
exports.ContentStudio = ContentStudio;
