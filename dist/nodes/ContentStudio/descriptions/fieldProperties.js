"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldProperties = void 0;
exports.fieldProperties = [
    // Common params
    {
        displayName: 'Workspace ID',
        name: 'workspaceId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getWorkspaces' },
        default: '',
        required: true,
        displayOptions: {
            show: {
                resource: ['socialAccount', 'post'],
            },
            hide: {
                resource: ['workspace', 'auth'],
            },
        },
    },
    // Posts list params
    {
        displayName: 'Page',
        name: 'page',
        type: 'number',
        default: 1,
        displayOptions: {
            show: { resource: ['post'], operation: ['list'] },
        },
    },
    {
        displayName: 'Per Page',
        name: 'perPage',
        type: 'number',
        default: 10,
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
        default: '',
        required: true,
        placeholder: '2025-10-11 11:15:00',
        description: 'Schedule date and time in format: YYYY-MM-DD HH:MM:SS',
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
    },
];
