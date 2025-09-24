"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resourceProperties = void 0;
exports.resourceProperties = [
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
            { name: 'List', value: 'list', action: 'List social accounts' },
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
            { name: 'List', value: 'list', action: 'List posts' },
            { name: 'Create', value: 'create', action: 'Create post' },
            { name: 'Delete', value: 'delete', action: 'Delete post' },
        ],
        default: 'list',
    },
];
