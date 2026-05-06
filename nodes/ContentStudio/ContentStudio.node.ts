import type { IExecuteFunctions, IHttpRequestOptions, INodeExecutionData, INodeType, INodeTypeDescription, ILoadOptionsFunctions, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import { getWorkspaces, getPosts, getAccounts, getFirstCommentAccounts, getContentCategories, getTeamMembers, getFacebookBackgrounds } from './loadOptions';
import { normalizeBase, parseAccounts, parseMediaImages, parseMediaVideo, parseCommaSeparated } from './utils';
import { BASE_URL } from '../../credentials/ContentStudio.credentials';

const CREDENTIALS_TYPE = 'contentStudio';

type ThreadItemPayload = {
  message: string;
  image?: string[];
  media?: string[];
  video?: string;
};

function createThreadOptionsSection(
  enableName: string,
  displayName: string,
  optionsName: string,
  collectionName: string,
  useMediaList = false,
): INodeProperties[] {
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
            ...((useMediaList ? [] : [
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
            ]) as INodeProperties[]),
          ],
        },
      ],
      displayOptions: { show: { resource: ['post'], operation: ['create'], [enableName]: [true] } },
    },
  ];
}

function parseThreadOptions(value: unknown, collectionName: string): ThreadItemPayload[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const items = (value as Record<string, unknown>)[collectionName];

  if (!Array.isArray(items)) {
    return [];
  }

  const parsedItems: ThreadItemPayload[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const threadItem = item as Record<string, unknown>;
    const message = typeof threadItem.message === 'string' ? threadItem.message.trim() : '';
    const media = parseThreadMediaList(threadItem);

    if (media.length > 0) {
      parsedItems.push({ message, media });
      continue;
    }

    const video = parseMediaVideo(threadItem.video);
    parsedItems.push({
      message,
      image: parseMediaImages(threadItem.image),
      ...(video ? { video } : {}),
    });
  }

  return parsedItems;
}

function parseThreadMediaList(threadItem: Record<string, unknown>): string[] {
  const media = threadItem.media;

  if (media && typeof media === 'object' && 'media' in (media as any)) {
    const values = (media as any).media;
    if (Array.isArray(values)) {
      return values.map((item: any) => item?.url).filter(Boolean);
    }
  }

  const legacyImages = parseMediaImages(threadItem.image);
  const legacyVideo = parseMediaVideo(threadItem.video);
  const legacyMediaIds = Array.isArray(threadItem.media_ids)
    ? threadItem.media_ids.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : [];

  return [...legacyImages, ...legacyMediaIds, ...(legacyVideo ? [legacyVideo] : [])];
}

export class ContentStudio implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ContentStudio',
    name: 'contentStudio',
    group: ['transform'],
    version: [4, 5],
    description: 'Integrate with ContentStudio API',
    defaults: { name: 'ContentStudio' },
    icon: 'file:contentstudio.png',
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
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
  methods = {
    loadOptions: {
      getWorkspaces,
      getPosts,
      getAccounts,
      getFirstCommentAccounts,
      getContentCategories,
      getTeamMembers,
      getFacebookBackgrounds,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
      const resource = this.getNodeParameter('resource', i) as string;
      const operation = this.getNodeParameter('operation', i) as string;

      const baseRoot = normalizeBase(BASE_URL);

      // Base request options
      const options: IHttpRequestOptions = {
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
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'socialAccount' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const platform = (this.getNodeParameter('platform', i) as string) || undefined;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
        options.qs = { page, per_page: perPage } as any;
        if (platform) (options.qs as any).platform = platform;
      }

      if (resource === 'contentCategory' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'label' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const search = (this.getNodeParameter('labelSearch', i) as string) || '';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (search) qs.search = search;
        options.qs = qs;
      }

      if (resource === 'campaign' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const search = (this.getNodeParameter('campaignSearch', i) as string) || '';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (search) qs.search = search;
        options.qs = qs;
      }

      if (resource === 'media' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const mediaType = (this.getNodeParameter('mediaType', i) as string) || '';
        const search = (this.getNodeParameter('mediaSearch', i) as string) || '';
        const sort = (this.getNodeParameter('mediaSort', i) as string) || 'recent';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/media`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (mediaType) qs.type = mediaType;
        if (search) qs.search = search;
        if (sort) qs.sort = sort;
        options.qs = qs;
      }

      if (resource === 'media' && operation === 'upload') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const mediaUrl = this.getNodeParameter('mediaUrl', i) as string;
        const folderId = (this.getNodeParameter('mediaFolderId', i) as string) || '';
        if (!mediaUrl) throw new Error('Media URL is required');
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/media`;
        options.body = { url: mediaUrl } as any;
        if (folderId) (options.body as any).folder_id = folderId;
      }

      if (resource === 'teamMember' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const search = (this.getNodeParameter('teamSearch', i) as string) || '';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (search) qs.search = search;
        options.qs = qs;
      }

      if (resource === 'comment' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('commentPostId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        if (!postId) throw new Error('Post ID is required');
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}/comments`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'comment' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('commentPostId', i) as string;
        const commentText = this.getNodeParameter('commentText', i) as string;
        const isNote = this.getNodeParameter('commentIsNote', i, false) as boolean;
        const mentionedUsersRaw = (this.getNodeParameter('commentMentionedUsers', i) as string) || '';
        if (!postId) throw new Error('Post ID is required');
        if (!commentText) throw new Error('Comment text is required');
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}/comments`;
        const body: any = { comment: commentText };
        if (isNote) body.is_note = true;
        if (mentionedUsersRaw.trim()) {
          body.mentioned_users = mentionedUsersRaw.split(',').map(s => s.trim()).filter(Boolean);
        }
        options.body = body;
      }

      if (resource === 'post' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const statusesCsv = (this.getNodeParameter('statusesCsv', i) as string) || '';
        const dateFrom = (this.getNodeParameter('dateFrom', i) as string) || '';
        const dateTo = (this.getNodeParameter('dateTo', i) as string) || '';
        const approvalAssignedTo = (this.getNodeParameter('approvalAssignedTo', i, '') as string) || '';
        const approvalRequestedBy = (this.getNodeParameter('approvalRequestedBy', i, '') as string) || '';

        // Build query string manually to ensure proper array format
        const qsParts: string[] = [`page=${page}`, `per_page=${perPage}`];
        const statuses = Array.from(new Set(statusesCsv.split(',').map(s => s.trim()).filter(Boolean)));
        statuses.forEach((s) => qsParts.push(`status[]=${encodeURIComponent(s)}`));
        if (dateFrom) qsParts.push(`date_from=${encodeURIComponent(dateFrom)}`);
        if (dateTo) qsParts.push(`date_to=${encodeURIComponent(dateTo)}`);
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
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const contentText = (this.getNodeParameter('contentText', i) as string) || '';
        const mediaImagesParam = this.getNodeParameter('mediaImages', i) as unknown;
        const mediaVideoParam = (this.getNodeParameter('mediaVideo', i) as string) || '';
        const accountsParam = this.getNodeParameter('accounts', i) as unknown;
        const publishType = (this.getNodeParameter('publishType', i) as string) || 'scheduled';

        // Get contentCategoryId when publish type is content_category
        let contentCategoryId = '';
        if (publishType === 'content_category') {
          contentCategoryId = (this.getNodeParameter('contentCategoryId', i) as string) || '';
        }

        // Get scheduled_at only if publish_type is 'scheduled'
        let scheduledAt = '';
        if (publishType === 'scheduled') {
          scheduledAt = (this.getNodeParameter('scheduledAt', i) as string) || '';
        } else {
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
        const hasFirstComment = this.getNodeParameter('hasFirstComment', i, false) as boolean;
        let firstCommentMessage = '';
        let firstCommentAccountIds: string[] = [];

        if (hasFirstComment) {
          firstCommentMessage = (this.getNodeParameter('firstCommentMessage', i) as string) || '';
          const firstCommentAccountsParam = this.getNodeParameter('firstCommentAccounts', i) as unknown;
          firstCommentAccountIds = parseAccounts(firstCommentAccountsParam);

          if (!firstCommentMessage.trim()) {
            throw new Error('First Comment Message is required when Enable First Comment is true');
          }

          // First comment accounts required only when content_category is NOT used
          if (firstCommentAccountIds.length === 0 && !contentCategoryId) {
            throw new Error('First Comment Accounts is required when Enable First Comment is true and no Content Category is selected');
          }
        }

        const mediaImages = parseMediaImages(mediaImagesParam);
        const mediaVideo = parseMediaVideo(mediaVideoParam);
        const accounts = parseAccounts(accountsParam);
        const hasTwitterOptions = this.getNodeParameter('hasTwitterOptions', i, false) as boolean;
        const hasThreadsOptions = this.getNodeParameter('hasThreadsOptions', i, false) as boolean;
        const twitterOptionsParam = this.getNodeParameter('twitterOptions', i, {}) as unknown;
        const threadsOptionsParam = this.getNodeParameter('threadsOptions', i, {}) as unknown;
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
          (options.body as any).twitter_options = {
            has_threaded_tweets: true,
            threaded_tweets: twitterThreadItems,
          };
        }

        if (hasThreadsOptions) {
          (options.body as any).threads_options = {
            has_multi_threads: true,
            multi_threads: threadsThreadItems.map((threadItem) => ({
              message: threadItem.message,
              media: threadItem.media ?? [],
            })),
          };
        }

        // Facebook text-post colored background (Facebook plain text posts only)
        const hasFacebookBackground = this.getNodeParameter('hasFacebookBackground', i, false) as boolean;
        if (hasFacebookBackground) {
          const facebookBackgroundId = (this.getNodeParameter('facebookBackgroundId', i, '') as string) || '';
          if (facebookBackgroundId.trim()) {
            (options.body as any).facebook_options = {
              facebook_background_id: facebookBackgroundId.trim(),
            };
          }
        }

        // Add content_category_id when publish type is content_category
        if (publishType === 'content_category' && contentCategoryId) {
          (options.body as any).content_category_id = contentCategoryId;
        }

        // Add first comment to body if enabled
        if (hasFirstComment && firstCommentMessage) {
          (options.body as any).first_comment = {
            message: firstCommentMessage,
            accounts: firstCommentAccountIds,
          };
        }

        // Add approval if enabled
        const sendForApproval = this.getNodeParameter('sendForApproval', i, false) as boolean;
        if (sendForApproval) {
          const approversParam = this.getNodeParameter('approvers', i, '') as unknown;
          const approvers = parseCommaSeparated(approversParam);
          if (approvers.length === 0) {
            throw new Error('At least one Approver ID is required when Send for Approval is enabled');
          }
          const approveOption = (this.getNodeParameter('approveOption', i) as string) || 'anyone';
          const approvalNotes = (this.getNodeParameter('approvalNotes', i) as string) || '';

          (options.body as any).approval = {
            approvers,
            approve_option: approveOption,
          };
          if (approvalNotes) {
            (options.body as any).approval.notes = approvalNotes;
          }
        }

        // Labels (handles string, array, JSON string from n8n expressions)
        const labelsParam = this.getNodeParameter('labels', i, '') as unknown;
        const labels = parseCommaSeparated(labelsParam);
        if (labels.length > 0) {
          (options.body as any).labels = labels;
        }

        // Campaign
        const campaignParam = this.getNodeParameter('campaignId', i, '') as unknown;
        const campaignId = Array.isArray(campaignParam) ? String(campaignParam[0] || '') : String(campaignParam || '');
        if (campaignId.trim()) {
          (options.body as any).campaign_id = campaignId.trim();
        }
      }

      if (resource === 'post' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('postId', i) as string;
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}`;
      }

      if (resource === 'post' && operation === 'approve') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const planId = this.getNodeParameter('planId', i) as string;
        const approvalAction = this.getNodeParameter('approvalAction', i) as string;
        const comment = (this.getNodeParameter('approvalComment', i) as string) || '';

        if (!planId) throw new Error('Post/Plan ID is required');
        if (!approvalAction) throw new Error('Action is required (approve or reject)');

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${planId}/approval`;
        const approvalBody: Record<string, unknown> = { action: approvalAction };
        if (comment) {
          approvalBody.comment = comment;
        }
        options.body = approvalBody;
      }

      const response = await this.helpers.httpRequestWithAuthentication.call(
        this,
        CREDENTIALS_TYPE,
        options,
      );
      returnData.push({ json: response, pairedItem: { item: i } });
      } catch (error) {
        if (this.continueOnFail()) {
          const message = (error as any)?.message || String(error);
          returnData.push({ json: { error: message }, pairedItem: { item: i } });
          continue;
        }
        if (error instanceof NodeApiError) {
          throw error;
        }
        throw new NodeApiError(this.getNode(), error as any, { itemIndex: i });
      }
    }

    return [returnData];
  }
}
