import type { IExecuteFunctions, IHttpRequestOptions, INodeExecutionData, INodeType, INodeTypeDescription, INodeProperties, INodePropertyOptions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { getWorkspaces, getPosts, getAccounts, getFirstCommentAccounts, getCarouselAccounts, getContentCategories, getTeamMembers, getFacebookBackgrounds, getApprovalWorkflows, getSchedulingAccounts, getWebhookEventTypes } from './loadOptions';
import { normalizeBase, parseAccounts, parseMediaImages, parseMediaVideo, parseCommaSeparated, parseJsonObject, parseJsonArray, parseSchedulingEntityRefs, flattenOptimalTimes, SCHEDULING_PLATFORMS } from './utils';
import { BASE_URL } from '../../credentials/ContentStudioApi.credentials';

const CREDENTIALS_TYPE = 'contentStudioApi';

// Color tokens shared by labels, campaigns and content categories. The backend
// stores the token; the hex is shown for reference only.
const COLOR_TOKEN_OPTIONS: INodePropertyOptions[] = [
  { name: 'color_1  (#69c366)', value: 'color_1' },
  { name: 'color_2  (#5cc6ff)', value: 'color_2' },
  { name: 'color_3  (#ff6462)', value: 'color_3' },
  { name: 'color_4  (#fea28b)', value: 'color_4' },
  { name: 'color_5  (#ff5f31)', value: 'color_5' },
  { name: 'color_6  (#864de9)', value: 'color_6' },
  { name: 'color_7  (#e7af4d)', value: 'color_7' },
  { name: 'color_8  (#fa6ab6)', value: 'color_8' },
  { name: 'color_9  (#0095f3)', value: 'color_9' },
  { name: 'color_10 (#dc70ea)', value: 'color_10' },
  { name: 'color_11 (#456990)', value: 'color_11' },
  { name: 'color_12 (#028090)', value: 'color_12' },
  { name: 'color_13 (#ffa13f)', value: 'color_13' },
  { name: 'color_14 (#231942)', value: 'color_14' },
  { name: 'color_15 (#544c72)', value: 'color_15' },
  { name: 'color_16 (#975816)', value: 'color_16' },
  { name: 'color_17 (#0e4749)', value: 'color_17' },
  { name: 'color_18 (#a5be00)', value: 'color_18' },
  { name: 'color_19 (#fc1100)', value: 'color_19' },
  { name: 'color_20 (#000000)', value: 'color_20' },
];

// Weekday values accepted by content category slots (lowercase, as the API stores them).
const SLOT_DAY_OPTIONS: INodePropertyOptions[] = [
  { name: 'Sunday', value: 'sunday' },
  { name: 'Monday', value: 'monday' },
  { name: 'Tuesday', value: 'tuesday' },
  { name: 'Wednesday', value: 'wednesday' },
  { name: 'Thursday', value: 'thursday' },
  { name: 'Friday', value: 'friday' },
  { name: 'Saturday', value: 'saturday' },
];

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
      displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
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
      displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], [enableName]: [true] } },
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
    credentials: [{ name: 'contentStudioApi', required: true }],
    usableAsTool: true,
    properties: [
      // Resource selector
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'AI Image', value: 'aiImage' },
          { name: 'AI Video', value: 'aiVideo' },
          { name: 'Approval Workflow', value: 'approvalWorkflow' },
          { name: 'Auth', value: 'auth' },
          { name: 'Brand', value: 'brand' },
          { name: 'Campaign', value: 'campaign' },
          { name: 'Comment', value: 'comment' },
          { name: 'Content Category', value: 'contentCategory' },
          { name: 'Content Category Slot', value: 'contentCategorySlot' },
          { name: 'Label', value: 'label' },
          { name: 'Limit', value: 'limit' },
          { name: 'Media', value: 'media' },
          { name: 'Post', value: 'post' },
          { name: 'Scheduling', value: 'scheduling' },
          { name: 'Share Link', value: 'shareLink' },
          { name: 'Social Account', value: 'socialAccount' },
          { name: 'Team Member', value: 'teamMember' },
          { name: 'Webhook', value: 'webhook' },
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
        displayOptions: { show: { resource: ['approvalWorkflow'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Approval Workflows' },
          { name: 'Get', value: 'get', action: 'Get an Approval Workflow' },
          { name: 'Create', value: 'create', action: 'Create an Approval Workflow' },
          { name: 'Update', value: 'update', action: 'Update an Approval Workflow' },
          { name: 'Delete', value: 'delete', action: 'Delete an Approval Workflow' },
          { name: 'Duplicate', value: 'duplicate', action: 'Duplicate an Approval Workflow' },
          { name: 'Set Default', value: 'setDefault', action: 'Set an Approval Workflow as default' },
          { name: 'Remove Default', value: 'removeDefault', action: 'Remove the default Approval Workflow flag' },
          { name: 'Get Cascade Job', value: 'getCascadeJob', action: 'Get an Approval Workflow cascade job' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['workspace'] } },
        options: [
          { name: 'List', value: 'list', action: 'List workspaces' },
          { name: 'Create', value: 'create', action: 'Create a workspace' },
          { name: 'Update', value: 'update', action: 'Update a workspace' },
          { name: 'Delete', value: 'delete', action: 'Delete a workspace' },
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
          { name: 'Remove', value: 'remove', action: 'Remove a Social Account' },
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
          { name: 'Get', value: 'get', action: 'Get a Content Category with its slots' },
          { name: 'Create', value: 'create', action: 'Create a Content Category' },
          { name: 'Update', value: 'update', action: 'Update a Content Category' },
          { name: 'Delete', value: 'delete', action: 'Delete a Content Category' },
          { name: 'Shuffle', value: 'shuffle', action: 'Shuffle upcoming posts in a Content Category' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['contentCategorySlot'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Content Category Slots' },
          { name: 'Create', value: 'create', action: 'Create a Content Category Slot' },
          { name: 'Update', value: 'update', action: 'Update a Content Category Slot' },
          { name: 'Delete', value: 'delete', action: 'Delete a Content Category Slot' },
          { name: 'Next Slot', value: 'next', action: 'Get the next Content Category Slot' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['webhook'] } },
        options: [
          { name: 'Get Event Types', value: 'getEventTypes', action: 'Get Webhook event types' },
          { name: 'List', value: 'list', action: 'List Webhooks' },
          { name: 'Get', value: 'get', action: 'Get a Webhook' },
          { name: 'Create', value: 'create', action: 'Create a Webhook' },
          { name: 'Update', value: 'update', action: 'Update a Webhook' },
          { name: 'Delete', value: 'delete', action: 'Delete a Webhook' },
          { name: 'Rotate Secret', value: 'rotateSecret', action: 'Rotate a Webhook signing secret' },
          { name: 'Get Deliveries', value: 'getDeliveries', action: 'Get Webhook delivery logs' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['brand'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get the Brand' },
          { name: 'Get Section', value: 'getSection', action: 'Get one Brand section' },
          { name: 'Create', value: 'create', action: 'Create the Brand by AI analysis' },
          { name: 'Update', value: 'update', action: 'Update the Brand' },
          { name: 'Delete', value: 'delete', action: 'Delete the Brand' },
          { name: 'Add Sources', value: 'addSources', action: 'Add Brand source materials' },
          { name: 'Delete Source', value: 'deleteSource', action: 'Delete a Brand source material' },
          { name: 'Sync', value: 'sync', action: 'Re-sync the Brand from its sources' },
          { name: 'Get Post Generation Settings', value: 'getPostSettings', action: 'Get Brand post generation settings' },
          { name: 'Update Post Generation Settings', value: 'updatePostSettings', action: 'Update Brand post generation settings' },
        ],
        default: 'get',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['shareLink'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Share Links' },
          { name: 'Get', value: 'get', action: 'Get a Share Link' },
          { name: 'Create', value: 'create', action: 'Create a Share Link' },
          { name: 'Update', value: 'update', action: 'Update a Share Link' },
          { name: 'Delete', value: 'delete', action: 'Delete a Share Link' },
          { name: 'Send Invitations', value: 'sendInvitations', action: 'Send Share Link approval invitations' },
          { name: 'Activity', value: 'activity', action: 'Get Share Link activity' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['limit'] } },
        options: [
          {
            name: 'Get',
            value: 'get',
            action: 'Get plan limits and usage',
            description:
              'Returns the plan summary, the 14 metered entitlements and the monthly usage-reset window, built live on every request. The request-rate ceiling is not part of the body — read it from the X-RateLimit-Limit / X-RateLimit-Remaining response headers.',
          },
        ],
        default: 'get',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['label'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Labels' },
          { name: 'Create', value: 'create', action: 'Create a label' },
          { name: 'Update', value: 'update', action: 'Update a label' },
          { name: 'Delete', value: 'delete', action: 'Delete a label' },
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
          { name: 'Create', value: 'create', action: 'Create a campaign' },
          { name: 'Update', value: 'update', action: 'Update a campaign' },
          { name: 'Delete', value: 'delete', action: 'Delete a campaign' },
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
          { name: 'Create', value: 'create', action: 'Invite a team member' },
          { name: 'Update', value: 'update', action: 'Update a team member' },
          { name: 'Delete', value: 'delete', action: 'Remove a team member' },
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
          { name: 'Get', value: 'get', action: 'Get Social Post' },
          { name: 'Create', value: 'create', action: 'Create Social Post' },
          { name: 'Update', value: 'update', action: 'Update Social Post' },
          { name: 'Delete', value: 'delete', action: 'Delete Post' },
          { name: 'Approve/Reject', value: 'approve', action: 'Approve or Reject Post' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['scheduling'] } },
        options: [
          { name: 'Best Times to Post', value: 'bestTimes', action: 'Get the best times to post' },
        ],
        default: 'bestTimes',
      },

      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['aiImage'] } },
        options: [
          { name: 'List Tools', value: 'listTools', action: 'List AI Image Tools' },
          { name: 'List Models', value: 'listModels', action: 'List AI Image Models' },
          { name: 'Brand Status', value: 'brandStatus', action: 'Get AI Brand Status' },
          { name: 'Generate', value: 'generate', action: 'Generate AI Image' },
          { name: 'Run Tool', value: 'runTool', action: 'Run a dedicated AI Image Tool' },
        ],
        default: 'listTools',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['aiVideo'] } },
        options: [
          { name: 'List Tools', value: 'listTools', action: 'List AI Video Tools' },
          { name: 'List Models', value: 'listModels', action: 'List AI Video Models' },
          { name: 'Estimate', value: 'estimate', action: 'Estimate AI Video Generation' },
          { name: 'Generate', value: 'generate', action: 'Generate AI Video' },
          { name: 'Run Tool', value: 'runTool', action: 'Run a dedicated AI Video Tool' },
          { name: 'List Jobs', value: 'list', action: 'List AI Video Jobs' },
          { name: 'Get Job', value: 'get', action: 'Get AI Video Job status' },
          { name: 'Cancel Job', value: 'delete', action: 'Cancel an AI Video Job' },
        ],
        default: 'listTools',
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
            resource: ['socialAccount', 'contentCategory', 'contentCategorySlot', 'label', 'campaign', 'limit', 'media', 'teamMember', 'post', 'comment', 'approvalWorkflow', 'shareLink', 'scheduling', 'aiVideo', 'aiImage', 'webhook', 'brand'],
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
          show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment', 'approvalWorkflow', 'shareLink', 'aiVideo'], operation: ['list'] },
        },
      },
      {
        displayName: 'Per Page',
        name: 'perPage',
        type: 'number',
        default: 10,
        typeOptions: { minValue: 1, maxValue: 100 },
        displayOptions: {
          show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment', 'approvalWorkflow', 'shareLink', 'aiVideo'], operation: ['list'] },
        },
      },

      // Workspace create/update/delete
      {
        displayName: 'Workspace ID',
        name: 'workspaceTargetId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getWorkspaces' },
        default: '',
        required: true,
        description: 'The workspace to update or delete',
        displayOptions: { show: { resource: ['workspace'], operation: ['update', 'delete'] } },
      },
      {
        displayName: 'Name',
        name: 'wsName',
        type: 'string',
        default: '',
        description: 'Workspace name (max 35 characters). Required when creating.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Logo URL',
        name: 'wsLogo',
        type: 'string',
        default: '',
        description: 'Workspace logo URL. Required when creating.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Timezone',
        name: 'wsTimezone',
        type: 'string',
        default: '',
        description: 'IANA timezone, e.g. Asia/Karachi. Required when creating.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Super Admin ID',
        name: 'wsSuperAdminId',
        type: 'string',
        default: '',
        description:
          'Account owner to create the workspace under. Optional when you are the account owner or are linked to exactly one super admin; required when you manage multiple super admins.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create'] } },
      },
      {
        displayName: 'Note',
        name: 'wsNote',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Instagram Posting Method',
        name: 'wsInstagramPostingMethod',
        type: 'options',
        options: [
          { name: '— Not set —', value: '' },
          { name: 'API', value: 'api' },
          { name: 'Mobile', value: 'mobile' },
        ],
        default: '',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'First Day of Week',
        name: 'wsFirstDay',
        type: 'options',
        options: [
          { name: '— Not set —', value: '' },
          { name: 'Sunday', value: 'Sunday' },
          { name: 'Monday', value: 'Monday' },
          { name: 'Tuesday', value: 'Tuesday' },
          { name: 'Wednesday', value: 'Wednesday' },
          { name: 'Thursday', value: 'Thursday' },
          { name: 'Friday', value: 'Friday' },
          { name: 'Saturday', value: 'Saturday' },
        ],
        default: '',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
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
      {
        displayName: 'Account',
        name: 'accountId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        required: true,
        description: 'The social account to remove (disconnect). This is the account id returned by List Social Accounts.',
        displayOptions: {
          show: { resource: ['socialAccount'], operation: ['remove'] },
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

      // Label create/update/delete
      {
        displayName: 'Label ID',
        name: 'labelId',
        type: 'string',
        default: '',
        required: true,
        description: 'The id of the label to update or delete (returned by List Labels)',
        displayOptions: {
          show: { resource: ['label'], operation: ['update', 'delete'] },
        },
      },
      {
        displayName: 'Name',
        name: 'labelName',
        type: 'string',
        default: '',
        required: true,
        description: 'Label name (max 100 characters)',
        displayOptions: {
          show: { resource: ['label'], operation: ['create'] },
        },
      },
      {
        displayName: 'Name',
        name: 'labelName',
        type: 'string',
        default: '',
        description: 'Label name (max 100 characters). Leave blank to keep the current value.',
        displayOptions: {
          show: { resource: ['label'], operation: ['update'] },
        },
      },
      {
        displayName: 'Color',
        name: 'labelColor',
        type: 'options',
        options: [
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: 'color_1',
        required: true,
        description: 'Color token for the label. The backend stores the token (e.g. color_1); the hex is shown for reference only.',
        displayOptions: {
          show: { resource: ['label'], operation: ['create'] },
        },
      },
      {
        displayName: 'Color',
        name: 'labelColor',
        type: 'options',
        options: [
          { name: '(keep current)', value: '' },
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: '',
        description: 'Color token for the label. Leave as "(keep current)" to leave color unchanged.',
        displayOptions: {
          show: { resource: ['label'], operation: ['update'] },
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

      // Campaign create/update/delete
      {
        displayName: 'Campaign ID',
        name: 'campaignId',
        type: 'string',
        default: '',
        required: true,
        description: 'The id of the campaign to update or delete (returned by List Campaigns)',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['update', 'delete'] },
        },
      },
      {
        displayName: 'Name',
        name: 'campaignName',
        type: 'string',
        default: '',
        required: true,
        description: 'Campaign name (max 100 characters)',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['create'] },
        },
      },
      {
        displayName: 'Name',
        name: 'campaignName',
        type: 'string',
        default: '',
        description: 'Campaign name (max 100 characters). Leave blank to keep the current value.',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['update'] },
        },
      },
      {
        displayName: 'Color',
        name: 'campaignColor',
        type: 'options',
        options: [
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: 'color_1',
        required: true,
        description: 'Color token for the campaign. The backend stores the token (e.g. color_1); the hex is shown for reference only.',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['create'] },
        },
      },
      {
        displayName: 'Color',
        name: 'campaignColor',
        type: 'options',
        options: [
          { name: '(keep current)', value: '' },
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: '',
        description: 'Color token for the campaign. Leave as "(keep current)" to leave color unchanged.',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['update'] },
        },
      },

      // Content Category get/update/delete/shuffle
      {
        displayName: 'Content Category ID',
        name: 'categoryId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getContentCategories', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        required: true,
        description: 'The content category to act on (returned by Content Category → List). Unknown ids answer CONTENT_CATEGORY_NOT_FOUND; global categories cannot be modified and answer CONTENT_CATEGORY_IS_GLOBAL.',
        displayOptions: {
          show: { resource: ['contentCategory'], operation: ['get', 'update', 'delete', 'shuffle'] },
        },
      },
      {
        displayName: 'Content Category ID',
        name: 'categoryId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getContentCategories', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        required: true,
        description: 'The content category whose posting slots are read or changed (returned by Content Category → List)',
        displayOptions: {
          show: { resource: ['contentCategorySlot'] },
        },
      },
      {
        displayName: 'Name',
        name: 'categoryName',
        type: 'string',
        default: '',
        required: true,
        description: 'Content category name (max 100 characters)',
        displayOptions: {
          show: { resource: ['contentCategory'], operation: ['create'] },
        },
      },
      {
        displayName: 'Name',
        name: 'categoryName',
        type: 'string',
        default: '',
        description: 'Content category name (max 100 characters). Leave blank to keep the current value.',
        displayOptions: {
          show: { resource: ['contentCategory'], operation: ['update'] },
        },
      },
      {
        displayName: 'Color',
        name: 'categoryColor',
        type: 'options',
        options: COLOR_TOKEN_OPTIONS,
        default: 'color_1',
        required: true,
        description: 'Color token for the category. The backend stores the token (e.g. color_1); the hex is shown for reference only.',
        displayOptions: {
          show: { resource: ['contentCategory'], operation: ['create'] },
        },
      },
      {
        displayName: 'Color',
        name: 'categoryColor',
        type: 'options',
        options: [{ name: '(keep current)', value: '' }, ...COLOR_TOKEN_OPTIONS],
        default: '',
        description: 'Color token for the category. Leave as "(keep current)" to leave color unchanged.',
        displayOptions: {
          show: { resource: ['contentCategory'], operation: ['update'] },
        },
      },
      {
        displayName: 'Allowed Members',
        name: 'categoryAllowedMembers',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getTeamMembers', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        description: 'Team members allowed to use this category (allowed_member_ids). On Update, leave empty to keep the stored list — any selection replaces it.',
        displayOptions: {
          show: { resource: ['contentCategory'], operation: ['create', 'update'] },
        },
      },
      {
        displayName: 'Accounts',
        name: 'categoryAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        description: 'Social accounts attached to the category — a flat list of social account ids. On Update, leave empty to keep the stored list.',
        displayOptions: {
          show: { resource: ['contentCategory'], operation: ['create', 'update'] },
        },
      },

      // Content Category Slot fields
      {
        displayName: 'Slot ID',
        name: 'slotId',
        type: 'string',
        default: '',
        required: true,
        description: 'The slot to update or delete (returned by Content Category Slot → List). Unknown ids answer CONTENT_CATEGORY_SLOT_NOT_FOUND.',
        displayOptions: {
          show: { resource: ['contentCategorySlot'], operation: ['update', 'delete'] },
        },
      },
      {
        displayName: 'Day',
        name: 'slotDay',
        type: 'options',
        options: SLOT_DAY_OPTIONS,
        default: 'monday',
        required: true,
        description: 'Weekday the slot fires on. Responses also carry weekday_sorting, where Sunday is 0.',
        displayOptions: {
          show: { resource: ['contentCategorySlot'], operation: ['create'] },
        },
      },
      {
        displayName: 'Hour',
        name: 'slotHour',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 12 },
        default: 9,
        required: true,
        description: 'Hour on a 12-hour clock, as an integer from 0 to 12. The API normalises 12 to 0, so 12 PM and 0 PM both mean noon.',
        displayOptions: {
          show: { resource: ['contentCategorySlot'], operation: ['create'] },
        },
      },
      {
        displayName: 'Minute',
        name: 'slotMinute',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 59 },
        default: 0,
        required: true,
        description: 'Minute of the hour, 0 to 59',
        displayOptions: {
          show: { resource: ['contentCategorySlot'], operation: ['create'] },
        },
      },
      {
        displayName: 'Period',
        name: 'slotPeriod',
        type: 'options',
        options: [
          { name: 'AM', value: 'AM' },
          { name: 'PM', value: 'PM' },
        ],
        default: 'AM',
        required: true,
        description: 'AM or PM half of the 12-hour clock. A slot repeating an existing day/hour/minute/period answers CONTENT_CATEGORY_SLOT_DUPLICATE.',
        displayOptions: {
          show: { resource: ['contentCategorySlot'], operation: ['create'] },
        },
      },
      {
        displayName: 'Update Fields',
        name: 'slotUpdateFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        description: 'Only the fields added here are sent; everything else keeps its stored value',
        options: [
          {
            displayName: 'Day',
            name: 'day',
            type: 'options',
            options: SLOT_DAY_OPTIONS,
            default: 'monday',
            description: 'Weekday the slot fires on',
          },
          {
            displayName: 'Hour',
            name: 'hour',
            type: 'number',
            typeOptions: { minValue: 0, maxValue: 12 },
            default: 9,
            description: 'Hour on a 12-hour clock, 0 to 12 (12 is normalised to 0)',
          },
          {
            displayName: 'Minute',
            name: 'minute',
            type: 'number',
            typeOptions: { minValue: 0, maxValue: 59 },
            default: 0,
            description: 'Minute of the hour, 0 to 59',
          },
          {
            displayName: 'Period',
            name: 'period',
            type: 'options',
            options: [
              { name: 'AM', value: 'AM' },
              { name: 'PM', value: 'PM' },
            ],
            default: 'AM',
            description: 'AM or PM half of the 12-hour clock',
          },
        ],
        displayOptions: {
          show: { resource: ['contentCategorySlot'], operation: ['update'] },
        },
      },
      {
        displayName: 'Post ID',
        name: 'slotPostId',
        type: 'string',
        default: '',
        description: 'Optional. Ask where an existing post already sits instead of where the next free slot is. When that post is queued into this category and still upcoming, its own time comes back with scheduled: true.',
        displayOptions: {
          show: { resource: ['contentCategorySlot'], operation: ['next'] },
        },
      },

      // Approval Workflow fields
      {
        displayName: 'Workflow ID',
        name: 'workflowId',
        type: 'string',
        default: '',
        required: true,
        description: 'The approval workflow to act on. Ids come from Approval Workflow → List, which only returns published workflows — for a draft, use the id returned when it was created. Unknown ids answer APPROVAL_WORKFLOW_NOT_FOUND.',
        displayOptions: {
          show: { resource: ['approvalWorkflow'], operation: ['get', 'update', 'delete', 'duplicate', 'setDefault', 'removeDefault'] },
        },
      },
      {
        displayName: 'Cascade Job ID',
        name: 'cascadeJobId',
        type: 'string',
        default: '',
        required: true,
        description: 'The cascade job to poll, returned as cascade_job_id by a confirmed Update or a forced Delete. Unknown ids answer CASCADE_JOB_NOT_FOUND.',
        displayOptions: {
          show: { resource: ['approvalWorkflow'], operation: ['getCascadeJob'] },
        },
      },
      {
        displayName: 'Name',
        name: 'workflowName',
        type: 'string',
        default: '',
        required: true,
        description: 'Approval workflow name (max 120 characters)',
        displayOptions: {
          show: { resource: ['approvalWorkflow'], operation: ['create'] },
        },
      },
      {
        displayName: 'Levels',
        name: 'workflowLevels',
        type: 'json',
        default: '[\n  {\n    "level_number": 1,\n    "title": "Manager review",\n    "rule": "anyone",\n    "members": [{ "user_id": "" }]\n  }\n]',
        required: true,
        description: 'Approval levels as a JSON array, 1 to 5 entries. Each entry needs level_number (1-5, unique across the array), rule ("everyone" or "anyone") and members (an array of { "user_id": "..." }, which may be empty); title is optional. A user_id may not repeat inside one level. Member ids come from Team Member → List.',
        displayOptions: {
          show: { resource: ['approvalWorkflow'], operation: ['create'] },
        },
      },
      {
        displayName: 'Save as Draft',
        name: 'workflowIsDraft',
        type: 'boolean',
        default: false,
        description: 'Whether to save the workflow as a draft. Drafts are excluded from List and cannot be made default (CANNOT_SET_DRAFT_AS_DEFAULT).',
        displayOptions: {
          show: { resource: ['approvalWorkflow'], operation: ['create'] },
        },
      },
      {
        displayName: 'Update Fields',
        name: 'workflowUpdateFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        description: 'Only the fields added here are sent; everything else keeps its stored value',
        options: [
          {
            displayName: 'Confirmed',
            name: 'confirmed',
            type: 'boolean',
            default: false,
            description: 'Whether to confirm an edit that cancels approvals already in flight. The API then answers 202 with a cascade_job_id, which Get Cascade Job polls.',
          },
          {
            displayName: 'Levels',
            name: 'levels',
            type: 'json',
            default: '[]',
            description: 'Replacement levels as a JSON array, same shape as on Create (1 to 5 entries). Replaces the stored levels wholesale.',
          },
          {
            displayName: 'Name',
            name: 'name',
            type: 'string',
            default: '',
            description: 'Approval workflow name (max 120 characters)',
          },
          {
            displayName: 'Save as Draft',
            name: 'is_draft',
            type: 'boolean',
            default: false,
            description: 'Whether the workflow stays a draft. Setting this to false publishes a draft.',
          },
        ],
        displayOptions: {
          show: { resource: ['approvalWorkflow'], operation: ['update'] },
        },
      },
      {
        displayName: 'Force Delete',
        name: 'workflowForceDelete',
        type: 'boolean',
        default: false,
        description: 'Whether to delete even when posts are still in review against this workflow. Without it such a delete is refused with REQUIRES_FORCE_DELETE; with it the API answers 202 and a cascade_job_id, which Get Cascade Job polls.',
        displayOptions: {
          show: { resource: ['approvalWorkflow'], operation: ['delete'] },
        },
      },

      // Webhook fields. Webhooks belong to the API key's user, not the workspace:
      // every workspace returns the same webhooks and workspaceId only picks whose
      // API credits the call spends (1 credit per call).
      {
        displayName: 'Webhook ID',
        name: 'webhookId',
        type: 'string',
        default: '',
        required: true,
        description: 'The webhook id (the id field on the webhook). Unknown ids answer 404 WEBHOOK_NOT_FOUND.',
        displayOptions: {
          show: { resource: ['webhook'], operation: ['get', 'update', 'delete', 'rotateSecret', 'getDeliveries'] },
        },
      },
      {
        displayName: 'URL',
        name: 'webhookUrl',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://example.com/hooks/contentstudio',
        description: 'HTTPS endpoint that receives the events. It must be publicly reachable: internal/private URLs are refused (422 WEBHOOK_URL_NOT_ALLOWED) and the URL is pinged before saving — it must answer 2xx within 5 seconds (422 WEBHOOK_PREFLIGHT_FAILED). A user can own at most 5 webhooks (422 WEBHOOK_LIMIT_REACHED).',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
      },
      {
        displayName: 'Event Types',
        name: 'webhookEventTypes',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getWebhookEventTypes', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        required: true,
        description: 'Events to subscribe to (event_types, at least one) — values come from the Get Event Types operation',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
      },
      {
        displayName: 'Name',
        name: 'webhookName',
        type: 'string',
        default: '',
        description: 'Optional label for the webhook (max 120 characters)',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
      },
      {
        displayName: 'Secret',
        name: 'webhookSecret',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        description: 'Optional signing secret; must start with whsec_. Leave empty to have one generated. The secret is returned only in the Create and Rotate Secret responses — store it then.',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
      },
      {
        displayName: 'Custom Headers',
        name: 'webhookCustomHeaders',
        type: 'json',
        default: '{}',
        description: 'Optional extra headers sent with every delivery (custom_headers) — a JSON object of string values, e.g. {"X-Source": "contentstudio"}',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
      },
      {
        displayName: 'Update Fields',
        name: 'webhookUpdateFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        description: 'Only the fields added here are sent; everything else keeps its stored value. The secret cannot be changed here — use Rotate Secret.',
        displayOptions: { show: { resource: ['webhook'], operation: ['update'] } },
        options: [
          {
            displayName: 'Custom Headers',
            name: 'custom_headers',
            type: 'json',
            default: '{}',
            description: 'JSON object of string header values; replaces the stored custom_headers',
          },
          {
            displayName: 'Event Types',
            name: 'event_types',
            type: 'multiOptions',
            typeOptions: { loadOptionsMethod: 'getWebhookEventTypes', loadOptionsDependsOn: ['workspaceId'] },
            default: [],
            description: 'Replaces the subscribed event_types (at least one)',
          },
          {
            displayName: 'Name',
            name: 'name',
            type: 'string',
            default: '',
            description: 'Webhook label (max 120 characters)',
          },
          {
            displayName: 'Status',
            name: 'status',
            type: 'options',
            options: [
              { name: 'Enabled', value: 'enabled' },
              { name: 'Disabled', value: 'disabled' },
            ],
            default: 'enabled',
            description: 'Enable or disable deliveries. Re-enabling a webhook the system disabled (disabled_by_system) is done by setting Enabled.',
          },
          {
            displayName: 'URL',
            name: 'url',
            type: 'string',
            default: '',
            description: 'New HTTPS endpoint; subject to the same public-URL check and 2xx ping as Create',
          },
        ],
      },
      {
        displayName: 'Page',
        name: 'webhookDeliveriesPage',
        type: 'number',
        default: 1,
        typeOptions: { minValue: 1 },
        displayOptions: { show: { resource: ['webhook'], operation: ['getDeliveries'] } },
      },
      {
        displayName: 'Per Page',
        name: 'webhookDeliveriesPerPage',
        type: 'number',
        default: 25,
        typeOptions: { minValue: 1, maxValue: 100 },
        displayOptions: { show: { resource: ['webhook'], operation: ['getDeliveries'] } },
      },
      {
        displayName: 'Filters',
        name: 'webhookDeliveriesFilters',
        type: 'collection',
        placeholder: 'Add Filter',
        default: {},
        description: 'Optional delivery-log filters. The response is flat: current_page, per_page, total, last_page, from, to and data.',
        displayOptions: { show: { resource: ['webhook'], operation: ['getDeliveries'] } },
        options: [
          {
            displayName: 'Event Type',
            name: 'event_type',
            type: 'options',
            typeOptions: { loadOptionsMethod: 'getWebhookEventTypes', loadOptionsDependsOn: ['workspaceId'] },
            default: '',
            description: 'Only deliveries of this event type',
          },
          {
            displayName: 'From',
            name: 'from',
            type: 'dateTime',
            default: '',
            description: 'Only deliveries at or after this time (ISO 8601)',
          },
          {
            displayName: 'Search',
            name: 'search',
            type: 'string',
            default: '',
            description: 'Free-text search across the delivery log',
          },
          {
            displayName: 'Status',
            name: 'status',
            type: 'options',
            options: [
              { name: 'All', value: 'all' },
              { name: 'Successful', value: 'successful' },
              { name: 'Failed', value: 'failed' },
            ],
            default: 'all',
            description: 'Filter by delivery outcome',
          },
          {
            displayName: 'To',
            name: 'to',
            type: 'dateTime',
            default: '',
            description: 'Only deliveries at or before this time (ISO 8601)',
          },
        ],
      },

      // Brand fields. The brand is the workspace's Brand Knowledge used by AI
      // generation; there is one brand per workspace, so no brand id is needed.
      {
        displayName: 'Section',
        name: 'brandSection',
        type: 'options',
        options: [
          { name: 'Style', value: 'style', description: 'Returns brand_style' },
          { name: 'Profile', value: 'profile', description: 'Returns brand_profile' },
          { name: 'Voice', value: 'voice', description: 'Returns brand_voice' },
        ],
        default: 'style',
        description: 'The part of the brand to read. The response holds schema_version, is_set_up, brand_<section> and updated_at.',
        displayOptions: { show: { resource: ['brand'], operation: ['getSection'] } },
      },
      {
        displayName: 'Source ID',
        name: 'brandSourceId',
        type: 'string',
        default: '',
        required: true,
        description: 'The id of the source material (from source_materials on the brand). Removes the source and the brand assets it produced; unknown ids answer 404 BRAND_SOURCE_NOT_FOUND. The response lists auto_reply_rules_affected.',
        displayOptions: { show: { resource: ['brand'], operation: ['deleteSource'] } },
      },
      {
        displayName: 'Website URL',
        name: 'brandWebsiteUrl',
        type: 'string',
        default: '',
        placeholder: 'https://example.com',
        description: 'Website to scrape and analyse (website_url). At least one of Website URL, Text, Files or Social Accounts is required. Create and Add Sources run the AI analysis synchronously and can take up to ~2 minutes (per source for Add Sources).',
        displayOptions: { show: { resource: ['brand'], operation: ['create', 'addSources'] } },
      },
      {
        displayName: 'Text',
        name: 'brandText',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        description: 'Brand information as free text (text, max 10000 characters)',
        displayOptions: { show: { resource: ['brand'], operation: ['create', 'addSources'] } },
      },
      {
        displayName: 'Files',
        name: 'brandFiles',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        placeholder: 'Add File',
        default: {},
        description: 'Documents to analyse (files, max 50): public https URLs of PDF, DOCX, TXT or Markdown files',
        displayOptions: { show: { resource: ['brand'], operation: ['create', 'addSources'] } },
        options: [
          {
            name: 'file',
            displayName: 'File',
            values: [
              {
                displayName: 'URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com/brand-guidelines.pdf',
                description: 'Public https URL of a PDF, DOCX, TXT or Markdown document',
              },
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                description: 'Optional display name (max 255 characters); defaults to the file name',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Social Account Names or IDs',
        name: 'brandSocialAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        description: 'Connected accounts whose recent posts are analysed (social_accounts — the id from Social Account → List). Supported platforms: Facebook, X (Twitter), Instagram, LinkedIn, Pinterest, Telegram, YouTube, TikTok, Tumblr, Google Business Profile, Bluesky. An id that is not a connected account of this workspace or is on another platform is a 422 VALIDATION_ERROR on social_accounts. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
        displayOptions: { show: { resource: ['brand'], operation: ['create', 'addSources'] } },
      },
      {
        displayName: 'Brand Style',
        name: 'brandStyle',
        type: 'collection',
        placeholder: 'Add Style Field',
        default: {},
        description: 'brand_style fields to change. Only the fields added here are sent; an empty text value clears the field.',
        displayOptions: { show: { resource: ['brand'], operation: ['update'] } },
        options: [
          {
            displayName: 'Body Font',
            name: 'body_font',
            type: 'string',
            default: '',
          },
          {
            displayName: 'Colors',
            name: 'colors',
            type: 'fixedCollection',
            typeOptions: { multipleValues: true },
            placeholder: 'Add Color',
            default: {},
            description: 'Replaces the brand colors (max 6; at most one each of brand, background and text)',
            options: [
              {
                name: 'color',
                displayName: 'Color',
                values: [
                  {
                    displayName: 'Hex',
                    name: 'hex',
                    type: 'string',
                    default: '',
                    placeholder: '#1A73E8',
                    description: 'Color in #RRGGBB form',
                  },
                  {
                    displayName: 'Role',
                    name: 'role',
                    type: 'options',
                    options: [
                      { name: 'Accent', value: 'accent' },
                      { name: 'Background', value: 'background' },
                      { name: 'Brand', value: 'brand' },
                      { name: 'Text', value: 'text' },
                    ],
                    default: 'brand',
                  },
                ],
              },
            ],
          },
          {
            displayName: 'Logo',
            name: 'logo',
            type: 'string',
            default: '',
            description: 'http(s) URL of the logo; leave empty to clear it. A ContentStudio storage URL is accepted only if it is the current logo or a file in this workspace\'s media library.',
          },
          {
            displayName: 'Title Font',
            name: 'title_font',
            type: 'string',
            default: '',
          },
          {
            displayName: 'Visual Identity Description',
            name: 'visual_identity_description',
            type: 'string',
            typeOptions: { rows: 3 },
            default: '',
          },
        ],
      },
      {
        displayName: 'Brand Profile',
        name: 'brandProfile',
        type: 'collection',
        placeholder: 'Add Profile Field',
        default: {},
        description: 'brand_profile fields to change. Text fields max 10000 characters. List fields take comma-separated values or a JSON array (entries max 200 characters) and replace the stored list.',
        displayOptions: { show: { resource: ['brand'], operation: ['update'] } },
        options: [
          { displayName: 'Business Name', name: 'business_name', type: 'string', default: '' },
          { displayName: 'Competitive Advantages', name: 'competitive_advantages', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
          { displayName: 'Competitors', name: 'competitors', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
          { displayName: 'Core Identity', name: 'core_identity', type: 'string', typeOptions: { rows: 3 }, default: '' },
          { displayName: 'Market Positioning', name: 'market_positioning', type: 'string', typeOptions: { rows: 3 }, default: '' },
          { displayName: 'Primary Customer Segments', name: 'primary_customer_segments', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
          { displayName: 'Primary Value Drivers', name: 'primary_value_drivers', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
        ],
      },
      {
        displayName: 'Brand Voice',
        name: 'brandVoice',
        type: 'collection',
        placeholder: 'Add Voice Field',
        default: {},
        description: 'brand_voice fields to change. Text fields max 10000 characters. List fields are free text, take comma-separated values or a JSON array (entries max 200 characters) and replace the stored list.',
        displayOptions: { show: { resource: ['brand'], operation: ['update'] } },
        options: [
          { displayName: 'Audience', name: 'audience', type: 'string', typeOptions: { rows: 3 }, default: '' },
          { displayName: 'Character', name: 'character', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
          { displayName: 'Emotion', name: 'emotion', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
          { displayName: 'Language', name: 'language', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
          { displayName: 'Purpose', name: 'purpose', type: 'string', typeOptions: { rows: 3 }, default: '' },
          { displayName: 'Tone', name: 'tone', type: 'string', default: '', description: 'Comma-separated or JSON array; replaces the list' },
          { displayName: 'Voice Description', name: 'voice_description', type: 'string', typeOptions: { rows: 3 }, default: '' },
        ],
      },
      {
        displayName: 'Brand Enabled',
        name: 'brandEnabled',
        type: 'options',
        options: [
          { name: 'Leave Unchanged', value: 'unchanged' },
          { name: 'Enabled', value: 'true' },
          { name: 'Disabled', value: 'false' },
        ],
        default: 'unchanged',
        description: 'Whether AI generation uses the brand (brand_enabled). Disabling pauses it without losing the brand.',
        displayOptions: { show: { resource: ['brand'], operation: ['update'] } },
      },
      {
        displayName: 'Settings',
        name: 'brandPostSettings',
        type: 'collection',
        placeholder: 'Add Setting',
        default: {},
        description: 'Only the settings added here change. Nothing saves until a Social Platform is stored or sent (422 VALIDATION_ERROR on social_platform). Creates the brand if the workspace has none.',
        displayOptions: { show: { resource: ['brand'], operation: ['updatePostSettings'] } },
        options: [
          {
            displayName: 'Aspect Ratio',
            name: 'aspect_ratio',
            type: 'options',
            options: ['8:1', '4:1', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '1:4', '1:8'].map((v) => ({ name: v, value: v })),
            default: '1:1',
          },
          {
            displayName: 'Caption Length',
            name: 'caption_length',
            type: 'number',
            typeOptions: { minValue: 20, maxValue: 200 },
            default: 40,
          },
          {
            displayName: 'Emoji Usage',
            name: 'emoji_usage',
            type: 'options',
            options: [
              { name: 'None', value: 'none' },
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'High', value: 'high' },
            ],
            default: 'medium',
          },
          {
            displayName: 'Hashtag Usage',
            name: 'hashtag_usage',
            type: 'options',
            options: [
              { name: 'None', value: 'none' },
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'High', value: 'high' },
            ],
            default: 'medium',
          },
          {
            displayName: 'Image Style',
            name: 'image_style',
            type: 'options',
            options: [
              'none', 'abstract', 'oil-painting', 'neon-punk', 'app-icon', 'black-white', 'bokeh', 'cartoon', 'cinematic',
              'cyberpunk', 'digital-watercolor', 'film-noir', 'film-poster', 'flat-design', 'futuristic', 'grunge',
              'highly-detailed', 'isometric', 'minimalistic', 'photorealistic', 'pixel-art', 'polaroid', 'pop-art',
              'retro-80s', 'steampunk', 'sticker', 'super-realistic', 'surrealism', 'tattoo', 'unreal-engine', 'vaporwave',
            ].map((v) => ({ name: v, value: v })),
            default: 'none',
          },
          {
            displayName: 'Language',
            name: 'language',
            type: 'options',
            options: [
              'English', 'Spanish', 'French', 'Portuguese', 'German', 'Italian', 'Dutch', 'Turkish', 'Indonesian', 'Tagalog',
              'Swedish', 'Danish', 'Norwegian', 'Romanian', 'Polish', 'Finnish', 'Hungarian', 'Greek', 'Czech', 'Malay',
              'Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)',
            ].map((v) => ({ name: v, value: v })),
            default: 'English',
          },
          {
            displayName: 'Number of Posts',
            name: 'no_of_posts',
            type: 'number',
            typeOptions: { minValue: 1, maxValue: 10 },
            default: 10,
          },
          {
            displayName: 'Post Type',
            name: 'post_type',
            type: 'options',
            options: [
              { name: 'Image', value: 'image' },
              { name: 'Text', value: 'text' },
              { name: 'Text + Image', value: 'text_image' },
            ],
            default: 'image',
          },
          {
            displayName: 'Social Platform',
            name: 'social_platform',
            type: 'options',
            options: [
              { name: 'Bluesky', value: 'bluesky' },
              { name: 'Facebook', value: 'facebook' },
              { name: 'Google Business Profile', value: 'gmb' },
              { name: 'Instagram', value: 'instagram' },
              { name: 'LinkedIn', value: 'linkedin' },
              { name: 'Telegram', value: 'telegram' },
              { name: 'Threads', value: 'threads' },
              { name: 'TikTok', value: 'tiktok' },
              { name: 'Tumblr', value: 'tumblr' },
              { name: 'X (Twitter)', value: 'twitter' },
            ],
            default: 'instagram',
          },
        ],
      },

      // Share Link fields
      {
        displayName: 'Search',
        name: 'shareLinkSearch',
        type: 'string',
        default: '',
        description: 'Optional case-insensitive match on the share link name',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['list'] },
        },
      },
      {
        displayName: 'Share Link ID',
        name: 'shareLinkId',
        type: 'string',
        default: '',
        required: true,
        description: 'The share link record id (the id field on the resource), NOT the public slug from the share URL. Unknown ids answer SHARE_LINK_NOT_FOUND.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['get', 'update', 'delete', 'sendInvitations', 'activity'] },
        },
      },
      {
        displayName: 'Name',
        name: 'shareLinkName',
        type: 'string',
        default: '',
        required: true,
        description: 'Share link name, 3 to 255 characters, letters, digits and spaces only. Punctuation is refused because the name is slugified into the public URL.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Scope',
        name: 'shareLinkScope',
        type: 'options',
        options: [
          { name: 'Selection', value: 'selection' },
          { name: 'Future', value: 'future' },
          { name: 'All', value: 'all' },
        ],
        default: 'selection',
        description: 'What the link shares. Future and All are calendar-only: they require View = Calendar and a Calendar Date, and cannot allow external approval actions.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'View',
        name: 'shareLinkView',
        type: 'options',
        options: [
          { name: 'List', value: 'list' },
          { name: 'Calendar', value: 'calendar' },
          { name: 'Compact List', value: 'compact_list' },
        ],
        default: 'list',
        description: 'How shared content is presented to whoever opens the link',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Calendar Date',
        name: 'shareLinkCalendarDate',
        type: 'string',
        default: '',
        placeholder: '2026-01-01 - 2026-03-31',
        description: 'Anchor for the Future/All window. Required for those scopes and refused for Selection. Free-form text: a single date or a "from - to" range.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'], shareLinkScope: ['future', 'all'] },
        },
      },
      {
        displayName: 'Plans',
        name: 'shareLinkPlans',
        type: 'string',
        default: '',
        description: 'Comma-separated post (plan) ids to share, max 500. Either Plans or Notes must be provided — Future/All links included, since they snapshot the posts visible at creation. Single Post links need exactly one. Plans cannot be changed later.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Notes',
        name: 'shareLinkNotes',
        type: 'string',
        default: '',
        description: 'Comma-separated note ids to share, max 500. Either Plans or Notes must be provided.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Show Notes',
        name: 'shareLinkShowNotes',
        type: 'boolean',
        default: false,
        description: 'Whether notes are visible to whoever opens the link',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Password Protected',
        name: 'shareLinkIsPasswordProtected',
        type: 'boolean',
        default: false,
        description: 'Whether the link asks for a password before showing anything',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Password',
        name: 'shareLinkPassword',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        description: 'Password for the link, 4 to 255 characters. Required while Password Protected is on, and never returned by the API.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'], shareLinkIsPasswordProtected: [true] },
        },
      },
      {
        displayName: 'Single Post',
        name: 'shareLinkIsSinglePost',
        type: 'boolean',
        default: false,
        description: 'Whether the link shows one post on a page of its own. Requires Scope = Selection and exactly one plan.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Allow External Comments',
        name: 'shareLinkAllowExternalComments',
        type: 'boolean',
        default: false,
        description: 'Whether people opening the link can leave comments',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Allow External Approval Actions',
        name: 'shareLinkAllowExternalApprovalActions',
        type: 'boolean',
        default: false,
        description: 'Whether people opening the link can approve or reject posts. Must stay off when Scope is Future or All.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Social Selections',
        name: 'shareLinkSocialSelections',
        type: 'json',
        default: '{}',
        description: 'Optional per-platform account selection object, as the planner sends it. Leave as {} to omit.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['create'] },
        },
      },
      {
        displayName: 'Update Fields',
        name: 'shareLinkUpdateFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        description: 'Only the fields added here are sent; everything else keeps its stored value. Plans and filters are create-only and are not accepted here.',
        options: [
          {
            displayName: 'Allow External Approval Actions',
            name: 'allow_external_approval_actions',
            type: 'boolean',
            default: false,
            description: 'Whether people opening the link can approve or reject posts',
          },
          {
            displayName: 'Allow External Comments',
            name: 'allow_external_comments',
            type: 'boolean',
            default: false,
            description: 'Whether people opening the link can leave comments',
          },
          {
            displayName: 'Approval Emails',
            name: 'approval_emails',
            type: 'string',
            default: '',
            description: 'Comma-separated email addresses, 1 to 10. Required while Approval Flow is on.',
          },
          {
            displayName: 'Approval Flow',
            name: 'approval_flow',
            type: 'boolean',
            default: false,
            description: 'Whether external approval is collected on this link. Requires Approval Emails and Approval Option.',
          },
          {
            displayName: 'Approval Option',
            name: 'approval_option',
            type: 'options',
            options: [
              { name: 'Anyone', value: 'anyone' },
              { name: 'Everyone', value: 'everyone' },
            ],
            default: 'anyone',
            description: 'Whether one invitee can approve alone, or every invitee must approve',
          },
          {
            displayName: 'Calendar Date',
            name: 'calendar_date',
            type: 'string',
            default: '',
            description: 'Anchor for a Future/All window, judged against the stored scope',
          },
          {
            displayName: 'Disabled',
            name: 'is_disabled',
            type: 'boolean',
            default: false,
            description: 'Whether the link is turned off without being deleted',
          },
          {
            displayName: 'Name',
            name: 'name',
            type: 'string',
            default: '',
            description: 'Share link name, 3 to 255 characters, letters, digits and spaces only',
          },
          {
            displayName: 'Notes',
            name: 'notes',
            type: 'string',
            default: '',
            description: 'Comma-separated note ids, max 500. Replaces the stored list.',
          },
          {
            displayName: 'Password',
            name: 'password',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Password for the link, 4 to 255 characters. Required while Password Protected is on.',
          },
          {
            displayName: 'Password Protected',
            name: 'is_password_protected',
            type: 'boolean',
            default: false,
            description: 'Whether the link asks for a password',
          },
          {
            displayName: 'Scope',
            name: 'scope',
            type: 'options',
            options: [
              { name: 'Selection', value: 'selection' },
              { name: 'Future', value: 'future' },
              { name: 'All', value: 'all' },
            ],
            default: 'selection',
            description: 'What the link shares. Future and All stay calendar-only.',
          },
          {
            displayName: 'Show Notes',
            name: 'show_notes',
            type: 'boolean',
            default: false,
            description: 'Whether notes are visible to whoever opens the link',
          },
          {
            displayName: 'Social Selections',
            name: 'social_selections',
            type: 'json',
            default: '{}',
            description: 'Per-platform account selection object',
          },
          {
            displayName: 'View',
            name: 'view',
            type: 'options',
            options: [
              { name: 'List', value: 'list' },
              { name: 'Calendar', value: 'calendar' },
              { name: 'Compact List', value: 'compact_list' },
            ],
            default: 'list',
            description: 'How shared content is presented',
          },
        ],
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['update'] },
        },
      },
      {
        displayName: 'Approval Emails',
        name: 'shareLinkApprovalEmails',
        type: 'string',
        default: '',
        required: true,
        description: 'Comma-separated email addresses to invite, 1 to 10. Duplicates are refused. Sending invitations turns the approval flow on.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['sendInvitations'] },
        },
      },
      {
        displayName: 'Approval Option',
        name: 'shareLinkApprovalOption',
        type: 'options',
        options: [
          { name: 'Anyone', value: 'anyone' },
          { name: 'Everyone', value: 'everyone' },
        ],
        default: 'anyone',
        required: true,
        description: 'Whether one invitee can approve alone, or every invitee must approve',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['sendInvitations'] },
        },
      },
      {
        displayName: 'Activity Type',
        name: 'shareLinkActivityType',
        type: 'options',
        options: [
          { name: 'All', value: '' },
          { name: 'Comment', value: 'comment' },
          { name: 'Action', value: 'action' },
        ],
        default: '',
        description: 'Return only one kind of activity. The response carries total and data.',
        displayOptions: {
          show: { resource: ['shareLink'], operation: ['activity'] },
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

      // Team member create/update/delete
      {
        displayName: 'Member ID',
        name: 'teamMemberId',
        type: 'string',
        default: '',
        required: true,
        description: 'Membership id (the member_id field returned by List Team Members)',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['update', 'delete'] },
        },
      },
      {
        displayName: 'Role',
        name: 'teamRole',
        type: 'options',
        options: [
          { name: 'Admin', value: 'admin' },
          { name: 'Approver', value: 'approver' },
          { name: 'Collaborator', value: 'collaborator' },
        ],
        default: 'collaborator',
        required: true,
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create', 'update'] },
        },
      },
      {
        displayName: 'Membership',
        name: 'teamMembership',
        type: 'options',
        options: [
          { name: 'Team', value: 'team' },
          { name: 'Client', value: 'client' },
        ],
        default: 'team',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create', 'update'] },
        },
      },
      {
        displayName: 'Email',
        name: 'teamEmail',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'name@example.com',
        description: 'Email address of the member to invite',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create'] },
        },
      },
      {
        displayName: 'Permissions (JSON)',
        name: 'teamPermissions',
        type: 'json',
        default: '{}',
        description:
          'Permission object — ROLE-AWARE: pass only booleans valid for the chosen role, else the API returns 422. ' +
          'Shared (any role): accessSharedFolder, allow_workflow_management. ' +
          'collaborator: addBlog, addSocial, addSource, addTopic, viewTeam, rescheduleQueue, postsReview, changeFBGroupPublishAs, hasListeningAccess. ' +
          'approver: approverCanEditPost, approverCanAddNotes, approverCanCreatePost. admin: hasBillingAccess. ' +
          'Account-access arrays of IDs (any role): facebook, instagram, threads, twitter, linkedin, pinterest, telegram, youtube, tiktok, tumblr, tumblr_blogs, tumblr_profiles, bluesky, gmb, wordpress, medium, shopify, webflow; plus content_categories[].',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create', 'update'] },
        },
      },
      {
        displayName: 'Confirm Removal',
        name: 'teamConfirmed',
        type: 'boolean',
        default: false,
        description:
          'Whether to confirm removal when the member is part of approval workflows or in-flight posts (otherwise the API returns REQUIRES_REMOVAL_CONFIRMATION)',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['delete'] },
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
        displayName: 'Statuses',
        name: 'statusesCsv',
        type: 'multiOptions',
        default: [],
        description: 'Filter posts by their publishing status. Leave empty to return posts with any status.',
        options: [
          { name: 'Published', value: 'published' },
          { name: 'Scheduled', value: 'scheduled' },
          { name: 'Draft', value: 'draft' },
          { name: 'Failed', value: 'failed' },
          { name: 'Partially Failed', value: 'partially_failed' },
          { name: 'In Review', value: 'under_review' },
          { name: 'Missed Review', value: 'missed_review' },
          { name: 'Rejected', value: 'rejected' },
          { name: 'In Progress', value: 'in_progress' },
          { name: 'Notification Sent', value: 'notification_sent' },
          { name: 'Notification Declined', value: 'notification_declined' },
        ],
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
      {
        displayName: 'Labels',
        name: 'labelsCsv',
        type: 'string',
        default: '',
        description: 'Filter by label IDs (comma-separated).',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Campaigns',
        name: 'campaignsCsv',
        type: 'string',
        default: '',
        description: 'Filter by campaign IDs (comma-separated).',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Content Categories',
        name: 'contentCategoryCsv',
        type: 'string',
        default: '',
        description: 'Filter by content category IDs (comma-separated).',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Created By',
        name: 'createdByCsv',
        type: 'string',
        default: '',
        description: 'Filter by user IDs who created the posts (comma-separated). Get IDs from the Team Member resource.',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Comment Status',
        name: 'commentStatus',
        type: 'options',
        options: [
          { name: 'All', value: 'all' },
          { name: 'Resolved', value: 'resolved' },
          { name: 'Unresolved', value: 'unresolved' },
        ],
        default: 'all',
        description: 'Filter posts by comment resolution status. "All" returns all posts regardless of comment state.',
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
        description: 'The ID of the post to fetch or delete. Get is the same shape as one item of Post → List; a deleted, foreign or malformed id answers 404.',
        displayOptions: { show: { resource: ['post'], operation: ['get', 'delete'] } },
      },
      {
        displayName: 'Post ID',
        name: 'updatePostId',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Enter post ID',
        description: 'The ID of the post to update. Get this from the Post List operation. Update is rejected (422) when the post status is already "published" or "processing".',
        displayOptions: { show: { resource: ['post'], operation: ['update'] } },
      },
      {
        displayName: 'Accounts',
        name: 'accounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        required: false,
        description: 'Select one or more social accounts to publish to. Optional if using Content Category (accounts will be merged from category).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Content Text',
        name: 'contentText',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
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
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
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
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Platform Overrides (JSON)',
        name: 'platformOverrides',
        type: 'json',
        default: '{}',
        description:
          'Per-platform content overrides, keyed by platform name: facebook, instagram, twitter, linkedin, pinterest, youtube, tiktok, gmb, tumblr, threads, bluesky, telegram. ' +
          'Each value is { content: { text?, post_type?, media?: { images?, video? } } }. Omit entirely to publish the same top-level Content Text / Media / Post Type to every platform. ' +
          'Merge semantics: content.text and content.post_type each merge independently with the top-level Content Text / Post Type — an override supplying only media still inherits the common text and post_type. ' +
          'content.media is atomic: if an override\'s content includes a media key AT ALL, that platform\'s media is defined ENTIRELY by the override (images/video together) — it does NOT fall back field-by-field to the common media. ' +
          'No media key in the override means that platform inherits the common Media Images/Media Video wholesale. This exists because some platforms (e.g. TikTok) can never support mixed images+video. ' +
          'Example: {"tiktok": {"content": {"media": {"video": "https://example.com/tiktok.mp4"}}}}',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      ...createThreadOptionsSection('hasTwitterOptions', 'Twitter Options', 'twitterOptions', 'threadedTweets', true),
      ...createThreadOptionsSection('hasThreadsOptions', 'Threads Options', 'threadsOptions', 'multiThreads', true),
      {
        displayName: 'Enable Facebook Options',
        name: 'hasFacebookBackground',
        type: 'boolean',
        default: false,
        description: 'Whether to add Facebook-specific options (e.g. a colored/gradient/image background for a plain-text Facebook post). Only applies to Facebook accounts on text-only posts.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Facebook Text-Post Background',
        name: 'facebookBackgroundId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getFacebookBackgrounds' },
        default: '',
        required: false,
        description: 'Pick a background preset. The backend rejects the post if images or video are attached.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookBackground: [true] } },
      },
      {
        displayName: 'Enable Facebook Carousel',
        name: 'hasFacebookCarousel',
        type: 'boolean',
        default: false,
        description: 'Whether to publish as a Facebook multi-card carousel post (2-10 link cards). Requires at least one Facebook account selected above. Carousel is image-only — video is not allowed.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Carousel Cards',
        name: 'carouselCards',
        type: 'fixedCollection',
        placeholder: 'Add Card',
        default: { card: [{ image: '', title: '', description: '', link: '' }, { image: '', title: '', description: '', link: '' }] },
        typeOptions: { multipleValues: true, minValue: 2, maxValue: 10 },
        description: 'Between 2 and 10 carousel cards. Each card needs an image URL and a destination link.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
        options: [
          {
            name: 'card',
            displayName: 'Card',
            values: [
              { displayName: 'Image URL', name: 'image', type: 'string', default: '', required: true, placeholder: 'https://example.com/card.jpg', description: 'Card image URL. External URLs are uploaded to the media library.' },
              { displayName: 'Title', name: 'title', type: 'string', default: '', description: 'Optional card title (max 255 chars).' },
              { displayName: 'Description', name: 'description', type: 'string', default: '', description: 'Optional card description (max 1000 chars).' },
              { displayName: 'Destination URL', name: 'link', type: 'string', default: '', required: true, placeholder: 'https://example.com/landing', description: 'Destination URL when this card is tapped.' },
            ],
          },
        ],
      },
      {
        displayName: 'Call To Action Button',
        name: 'carouselCallToAction',
        type: 'options',
        default: 'NO_BUTTON',
        description: 'CTA button shown on every card.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
        options: [
          { name: 'No Button', value: 'NO_BUTTON' },
          { name: 'Add To Cart', value: 'ADD_TO_CART' },
          { name: 'Apply Now', value: 'APPLY_NOW' },
          { name: 'Bet Now', value: 'BET_NOW' },
          { name: 'Book Now', value: 'BOOK_TRAVEL' },
          { name: 'Buy Now', value: 'BUY_NOW' },
          { name: 'Buy Tickets', value: 'BUY_TICKETS' },
          { name: 'Call Now', value: 'CALL_NOW' },
          { name: 'Contact Us', value: 'CONTACT_US' },
          { name: 'Download', value: 'DOWNLOAD' },
          { name: 'Get Directions', value: 'GET_DIRECTIONS' },
          { name: 'Get Offer', value: 'GET_OFFER' },
          { name: 'Get Quote', value: 'GET_QUOTE' },
          { name: 'Go Live', value: 'GO_LIVE' },
          { name: 'Install Now', value: 'INSTALL_MOBILE_APP' },
          { name: 'Learn More', value: 'LEARN_MORE' },
          { name: 'Like Page', value: 'LIKE_PAGE' },
          { name: 'Listen Now', value: 'LISTEN_MUSIC' },
          { name: 'Open Link', value: 'OPEN_LINK' },
          { name: 'Order Now', value: 'ORDER_NOW' },
          { name: 'Play Game', value: 'PLAY_GAME' },
          { name: 'Register Now', value: 'REGISTER_NOW' },
          { name: 'Request Time', value: 'REQUEST_TIME' },
          { name: 'Save', value: 'SAVE' },
          { name: 'Send Message', value: 'MESSAGE_PAGE' },
          { name: 'Send Message to WhatsApp', value: 'WHATSAPP_MESSAGE' },
          { name: 'Shop Now', value: 'SHOP_NOW' },
          { name: 'Sign Up', value: 'SIGN_UP' },
          { name: 'Subscribe', value: 'SUBSCRIBE' },
          { name: 'Use App', value: 'USE_APP' },
          { name: 'Watch More', value: 'WATCH_MORE' },
          { name: 'Watch Video', value: 'WATCH_VIDEO' },
        ],
      },
      {
        displayName: 'Include End Card',
        name: 'carouselEndCard',
        type: 'boolean',
        default: false,
        description: 'Whether to include the Facebook end card after the last card.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
      },
      {
        displayName: 'End Card URL',
        name: 'carouselEndCardUrl',
        type: 'string',
        default: '',
        placeholder: 'https://example.com',
        description: 'Destination URL for the end card. Falls back to the first card\'s link when omitted.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
      },
      {
        displayName: 'Carousel Target Accounts',
        name: 'carouselAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getCarouselAccounts', loadOptionsDependsOn: ['workspaceId', 'accounts'] },
        default: [],
        description: 'Restrict carousel mode to a subset of your selected Facebook accounts. Leave empty to apply carousel to ALL Facebook accounts in this post. Only Facebook accounts from the selected accounts above are shown.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
      },
      {
        displayName: 'Facebook Reel Collaborators',
        name: 'facebookCollaborators',
        type: 'string',
        default: '',
        placeholder: '1234567890, @mypage, https://facebook.com/mypage',
        description: 'Comma-separated Facebook Page identifiers to invite as Reel collaborators (max 10). Each item is a Facebook Page: a numeric Page ID (recommended), an @username, or a Page URL. Applied server-side only when the post resolves to a Facebook reel (post type "Reel" or "Reel + Story" with a video); ignored otherwise. Facebook allows up to 10 invites per Page per 24h.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookBackground: [true] } },
      },
      {
        displayName: 'Enable Instagram Options',
        name: 'hasInstagramOptions',
        type: 'boolean',
        default: false,
        description: 'Whether to add Instagram-specific options (e.g. collaborators/co-authors). Only applies to Instagram accounts.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Instagram Collaborators',
        name: 'instagramCollaborators',
        type: 'string',
        default: '',
        placeholder: 'username1, username2, username3',
        description: 'Comma-separated Instagram usernames to invite as collaborators/co-authors (max 3). Applied to any non-story Instagram post. Mutually exclusive with Instagram Trial Reel on the same request.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasInstagramOptions: [true] } },
      },
      {
        displayName: 'Enable Instagram Trial Reel',
        name: 'instagramTrialReelEnabled',
        type: 'boolean',
        default: false,
        description: 'Whether to publish as an Instagram trial reel — shown to non-followers first, and not shown on the profile grid or in follower feeds until it graduates. Mutually exclusive with Instagram Collaborators and with sharing to Story on the same request (the backend rejects the combination).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasInstagramOptions: [true] } },
      },
      {
        displayName: 'Trial Reel Graduation Strategy',
        name: 'instagramTrialReelGraduationStrategy',
        type: 'options',
        options: [
          { name: 'Auto-Graduate on Good Performance (SS_PERFORMANCE)', value: 'SS_PERFORMANCE' },
          { name: 'Manual — Graduate in Instagram App Only (MANUAL)', value: 'MANUAL' },
        ],
        default: 'SS_PERFORMANCE',
        description: 'How the trial reel graduates to followers. SS_PERFORMANCE auto-graduates the reel to followers if it performs well; MANUAL requires graduating it by hand in the Instagram app.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasInstagramOptions: [true], instagramTrialReelEnabled: [true] } },
      },
      {
        displayName: 'Enable LinkedIn Options',
        name: 'hasLinkedinOptions',
        type: 'boolean',
        default: false,
        description: 'Whether to add LinkedIn-specific options (a document/post title and/or a poll). Only applies to LinkedIn accounts.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'LinkedIn Title',
        name: 'linkedinTitle',
        type: 'string',
        default: '',
        description: 'Optional LinkedIn post/document title (max 255 characters).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true] } },
      },
      {
        displayName: 'Enable LinkedIn Poll',
        name: 'linkedinEnablePoll',
        type: 'boolean',
        default: false,
        description: 'Whether to attach a LinkedIn poll. A poll requires Post Type = "Poll" and a text-only post (no images or video).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true] } },
      },
      {
        displayName: 'Poll Question',
        name: 'linkedinPollQuestion',
        type: 'string',
        default: '',
        required: true,
        description: 'The poll question (max 140 characters).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true], linkedinEnablePoll: [true] } },
      },
      {
        displayName: 'Poll Options',
        name: 'linkedinPollOptions',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Option A, Option B',
        description: 'Comma-separated poll options: between 2 and 4 options, each max 30 characters.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true], linkedinEnablePoll: [true] } },
      },
      {
        displayName: 'Poll Duration',
        name: 'linkedinPollDuration',
        type: 'options',
        options: [
          { name: '1 Day', value: 'ONE_DAY' },
          { name: '3 Days', value: 'THREE_DAYS' },
          { name: '7 Days', value: 'SEVEN_DAYS' },
          { name: '14 Days', value: 'FOURTEEN_DAYS' },
        ],
        default: 'ONE_DAY',
        required: true,
        description: 'How long the poll stays open.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true], linkedinEnablePoll: [true] } },
      },
      {
        displayName: 'Post Type',
        name: 'postType',
        type: 'options',
        default: 'feed',
        description: 'Optional post type. Platform-specific. For Facebook carousel posts you may set "Carousel" here, but you must also enable Facebook Carousel above with at least 2 cards. For a LinkedIn poll set "Poll" here and enable LinkedIn Options → Poll below (poll posts must be text-only — no images or video).',
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
          { name: 'Shorts', value: 'shorts' },
          { name: 'Poll', value: 'poll' },
        ],
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
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
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Content Category',
        name: 'contentCategoryId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getContentCategories', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        required: true,
        description: 'Select a content category. Accounts from the category will be used if no accounts are selected.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['content_category'] } },
      },
      {
        displayName: 'Scheduled At',
        name: 'scheduledAt',
        type: 'string',
        required: true,
        default: '',
        placeholder: '2025-10-11 11:15:00',
        description: 'Schedule date and time in format: YYYY-MM-DD HH:MM:SS',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['scheduled'] } },
      },
      {
        displayName: 'Enable Repeat',
        name: 'enableRepeat',
        type: 'boolean',
        default: false,
        description: 'Whether to republish this post on a fixed interval. Repeat is only supported on scheduled (and immediate) posts, never on queued, draft or content-category posts. It is never inherited on Update: leave this off when updating and any existing repeat schedule is dropped.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['scheduled'] } },
      },
      {
        displayName: 'Repeat Type',
        name: 'repeatType',
        type: 'options',
        options: [
          { name: 'Day', value: 'Day' },
          { name: 'Week', value: 'Week' },
          { name: 'Month', value: 'Month' },
        ],
        default: 'Week',
        description: 'Unit the repeat interval is counted in',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['scheduled'], enableRepeat: [true] } },
      },
      {
        displayName: 'Repeat Times',
        name: 'repeatTimes',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 30 },
        default: 2,
        description: 'How many times the post repeats, 1 to 30',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['scheduled'], enableRepeat: [true] } },
      },
      {
        displayName: 'Repeat Interval',
        name: 'repeatGap',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 99 },
        default: 1,
        description: 'Gap between repeats, counted in the repeat type unit, 1 to 99. A Day repeat must be at least 3.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['scheduled'], enableRepeat: [true] } },
      },
      {
        displayName: 'Enable First Comment',
        name: 'hasFirstComment',
        type: 'boolean',
        default: false,
        description: 'Whether to add a first comment to the post',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Comment Message',
        name: 'firstCommentMessage',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'Enter your first comment...',
        description: 'The message to post as the first comment',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFirstComment: [true] } },
      },
      {
        displayName: 'Comment Accounts',
        name: 'firstCommentAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getFirstCommentAccounts', loadOptionsDependsOn: ['workspaceId', 'accounts'] },
        required: false,
        default: [],
        description: 'Select accounts to add the first comment. Optional if using Content Category (accounts will be merged from category).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFirstComment: [true] } },
      },

      // Post create — approval fields
      {
        displayName: 'Send for Approval',
        name: 'sendForApproval',
        type: 'boolean',
        default: false,
        description: 'Whether to send this post for approval before publishing',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Approver IDs',
        name: 'approvers',
        type: 'string',
        default: '',
        required: true,
        description: 'Comma-separated user IDs of team members who can approve. Get IDs from the Team Member resource.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], sendForApproval: [true] } },
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
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], sendForApproval: [true] } },
      },
      {
        displayName: 'Notes for Approvers',
        name: 'approvalNotes',
        type: 'string',
        default: '',
        description: 'Optional notes for the approvers',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], sendForApproval: [true] } },
      },

      // Post create/update — multi-level approval workflow (mutually exclusive with the legacy approval above)
      {
        displayName: 'Use Approval Workflow',
        name: 'useApprovalWorkflow',
        type: 'boolean',
        default: false,
        description: 'Whether to attach a multi-level approval workflow to this post. Mutually exclusive with "Send for Approval" above — enable only one. Use the Approval Workflow resource to list available workflows.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Approval Workflow',
        name: 'approvalWorkflowId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getApprovalWorkflows', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        description: 'The workflow to attach to the post (its id). On create this is required to attach a workflow. On update, set this to (re)attach a workflow, OR leave it empty and choose a Workflow Action instead — provide exactly one of the two.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], useApprovalWorkflow: [true] } },
      },
      {
        displayName: 'Workflow Action',
        name: 'approvalWorkflowAction',
        type: 'options',
        options: [
          { name: '— None (attach via Approval Workflow above) —', value: '' },
          { name: 'Restart', value: 'restart' },
          { name: 'Resume', value: 'resume' },
          { name: 'Renotify Current', value: 'renotify_current' },
          { name: 'Keep', value: 'keep' },
          { name: 'Remove', value: 'remove' },
        ],
        default: '',
        description: 'Update-only action on the already-attached workflow. Provide exactly one of Approval Workflow (attach) or Workflow Action — not both.',
        displayOptions: { show: { resource: ['post'], operation: ['update'], useApprovalWorkflow: [true] } },
      },
      {
        displayName: 'Workflow Notes',
        name: 'approvalWorkflowNotes',
        type: 'string',
        default: '',
        description: 'Optional notes for the approval workflow.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], useApprovalWorkflow: [true] } },
      },

      // Post create — labels & campaign
      {
        displayName: 'Label IDs',
        name: 'labels',
        type: 'string',
        default: '',
        description: 'Comma-separated label IDs to assign to the post. Get IDs from the Label resource. Max 20.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Campaign ID',
        name: 'campaignId',
        type: 'string',
        default: '',
        description: 'Campaign ID to assign the post to. Get the ID from the Campaign resource.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },

      // AI Image — generate
      {
        displayName: 'Prompt',
        name: 'aiImagePrompt',
        type: 'string',
        default: '',
        required: true,
        typeOptions: { rows: 3 },
        description: 'Text prompt describing the image to generate (max 1000 characters)',
        displayOptions: { show: { resource: ['aiImage'], operation: ['generate'] } },
      },
      {
        displayName: 'Image URL',
        name: 'aiImageImageUrl',
        type: 'string',
        default: '',
        description:
          'Base image URL — switches generation to image-to-image editing. Use Brand and Dimensions do not apply on this branch.',
        displayOptions: { show: { resource: ['aiImage'], operation: ['generate'] } },
      },
      {
        displayName: 'Model',
        name: 'aiImageModel',
        type: 'string',
        default: '',
        description: 'Model key to use — must be one of the values returned by List Models. Leave empty for the workspace default.',
        displayOptions: { show: { resource: ['aiImage'], operation: ['generate'] } },
      },
      {
        displayName: 'Use Brand',
        name: 'aiImageUseBrand',
        type: 'boolean',
        default: false,
        description:
          'Whether to apply the workspace brand knowledge (resolved server-side, no brand ID accepted). Text-to-image only — ignored when Image URL is set; brand_applied is always false on the image-to-image branch.',
        displayOptions: { show: { resource: ['aiImage'], operation: ['generate'] } },
      },
      {
        displayName: 'Dimensions',
        name: 'aiImageDimensions',
        type: 'options',
        options: [
          { name: 'Default', value: '' },
          { name: 'Square', value: 'square' },
          { name: 'Square HD', value: 'square_hd' },
          { name: 'Portrait 4:5', value: 'portrait_4_5' },
          { name: 'Landscape 16:9', value: 'landscape_16_9' },
        ],
        default: '',
        description: 'Text-to-image only. Ignored when Image URL is present — an edit keeps the base image geometry.',
        displayOptions: { show: { resource: ['aiImage'], operation: ['generate'] } },
      },
      {
        displayName: 'Enhance Prompt',
        name: 'aiImageEnhancePrompt',
        type: 'boolean',
        default: false,
        description: 'Whether to let the AI enhance/expand the prompt before generation',
        displayOptions: { show: { resource: ['aiImage'], operation: ['generate'] } },
      },

      // AI Image — run tool
      {
        displayName: 'Tool',
        name: 'aiImageToolKey',
        type: 'options',
        options: [
          { name: 'Image to Image', value: 'image-to-image' },
          { name: 'Remove Background', value: 'remove-background' },
          { name: 'Upscale', value: 'upscale' },
          { name: 'Headshot', value: 'headshot' },
          { name: 'Face Swap', value: 'face-swap' },
          { name: 'Outfit Swap', value: 'outfit-swap' },
          { name: 'Product Image', value: 'product-image' },
        ],
        default: 'remove-background',
        required: true,
        description: 'The tool key to invoke (returned by List Tools)',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'] } },
      },
      {
        displayName: 'Prompt',
        name: 'aiImageToolPrompt',
        type: 'string',
        default: '',
        required: true,
        typeOptions: { rows: 3 },
        description: 'Prompt describing the edit (max 1000 characters)',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['image-to-image'] } },
      },
      {
        displayName: 'Attachments (Comma-Separated URLs)',
        name: 'aiImageToolAttachments',
        type: 'string',
        default: '',
        required: true,
        description: 'Base image URL(s) to edit — at least one required',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['image-to-image'] } },
      },
      {
        displayName: 'Model',
        name: 'aiImageToolModel',
        type: 'string',
        default: '',
        description: 'Model key to use for this tool. Leave empty for the workspace default.',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['image-to-image'] } },
      },
      {
        displayName: 'Enhance Prompt',
        name: 'aiImageToolEnhancePrompt',
        type: 'boolean',
        default: false,
        description: 'Whether to let the AI enhance/expand the prompt before generation',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['image-to-image'] } },
      },
      {
        displayName: 'Image URL',
        name: 'aiImageToolImageUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'Source image URL',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['remove-background', 'upscale', 'headshot'] } },
      },
      {
        displayName: 'Aspect Ratio',
        name: 'aiImageToolAspectRatio',
        type: 'string',
        default: '',
        description: 'Optional aspect ratio hint for this tool',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['headshot', 'product-image'] } },
      },
      {
        displayName: 'Resolution',
        name: 'aiImageToolResolution',
        type: 'string',
        default: '',
        description: 'Optional resolution hint for this tool',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['upscale', 'headshot', 'face-swap', 'product-image'] } },
      },
      {
        displayName: 'Target Image URL',
        name: 'aiImageToolTargetImageUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'The base image to modify',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['face-swap', 'outfit-swap'] } },
      },
      {
        displayName: 'Face Image URL',
        name: 'aiImageToolFaceImageUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'Source face image URL',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['face-swap'] } },
      },
      {
        displayName: 'Outfit Image URL',
        name: 'aiImageToolOutfitImageUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'Reference outfit image URL',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['outfit-swap'] } },
      },
      {
        displayName: 'Product Image URL',
        name: 'aiImageToolProductImageUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'Source product image URL',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['product-image'] } },
      },
      {
        displayName: 'Reference Image URL',
        name: 'aiImageToolReferenceImageUrl',
        type: 'string',
        default: '',
        description: 'Optional reference image URL',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['product-image'] } },
      },
      {
        displayName: 'Instructions',
        name: 'aiImageToolInstructions',
        type: 'string',
        default: '',
        typeOptions: { rows: 2 },
        description: 'Optional free-text instructions (max 1000 characters)',
        displayOptions: { show: { resource: ['aiImage'], operation: ['runTool'], aiImageToolKey: ['product-image'] } },
      },

      // AI Video — estimate/generate shared options
      {
        displayName: 'Duration (Seconds)',
        name: 'aiVideoDuration',
        type: 'number',
        default: 4.0,
        description: 'Requested video duration in seconds',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['estimate', 'generate'] } },
      },
      {
        displayName: 'Model',
        name: 'aiVideoModel',
        type: 'string',
        default: '',
        description: 'Model key to use (returned by List Models). Leave empty for the workspace default.',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['estimate', 'generate'] } },
      },
      {
        displayName: 'Resolution',
        name: 'aiVideoResolution',
        type: 'string',
        default: '',
        description: 'Resolution key supported by the chosen model (see List Models supported_resolutions)',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['estimate', 'generate'] } },
      },
      {
        displayName: 'Aspect Ratio',
        name: 'aiVideoAspectRatio',
        type: 'string',
        default: '',
        description: 'Aspect ratio supported by the chosen model (see List Models supported_ratios)',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['estimate', 'generate'] } },
      },
      {
        displayName: 'Enable Audio',
        name: 'aiVideoEnableAudio',
        type: 'boolean',
        default: false,
        description: 'Whether to generate audio along with the video (model must support it)',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['estimate', 'generate'] } },
      },
      {
        displayName: 'Enhance Prompt',
        name: 'aiVideoEnhancePrompt',
        type: 'boolean',
        default: false,
        description: 'Whether to let the AI enhance/expand the prompt before generation',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['estimate', 'generate'] } },
      },
      {
        displayName: 'Generation Mode',
        name: 'aiVideoGenerationMode',
        type: 'options',
        options: [
          { name: 'Text to Video', value: 'text-to-video' },
          { name: 'Image to Video', value: 'image-to-video' },
          { name: 'Reference to Video', value: 'reference-to-video' },
        ],
        default: 'text-to-video',
        description:
          'Only used by Estimate. Generate infers the mode automatically from Image URL / Reference Image URLs.',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['estimate'] } },
      },

      // AI Video — generate
      {
        displayName: 'Prompt',
        name: 'aiVideoPrompt',
        type: 'string',
        default: '',
        required: true,
        typeOptions: { rows: 3 },
        description: 'Text prompt describing the video to generate (max 1000 characters)',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['generate'] } },
      },
      {
        displayName: 'Image URL',
        name: 'aiVideoImageUrl',
        type: 'string',
        default: '',
        description:
          'Source image URL — switches generation to image-to-video. Mutually exclusive with Reference Image URLs.',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['generate'] } },
      },
      {
        displayName: 'Reference Image URLs',
        name: 'aiVideoReferenceImageUrls',
        type: 'string',
        default: '',
        description:
          'Comma-separated image URLs (max 8) — switches generation to reference-to-video. Mutually exclusive with Image URL.',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['generate'] } },
      },
      {
        displayName: 'Style',
        name: 'aiVideoStyle',
        type: 'string',
        default: '',
        description: 'Optional style hint passed to the model',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['generate'] } },
      },
      {
        displayName: 'Use Brand',
        name: 'aiVideoUseBrand',
        type: 'boolean',
        default: false,
        description: 'Whether to apply the workspace brand kit (brand is resolved server-side, no ID accepted)',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['generate'] } },
      },

      // AI Video — run tool
      {
        displayName: 'Tool',
        name: 'aiVideoToolKey',
        type: 'options',
        options: [
          { name: 'Motion Control', value: 'motion-control' },
          { name: 'Lip Sync', value: 'lip-sync' },
          { name: 'Talking Avatar', value: 'talking-avatar' },
        ],
        default: 'motion-control',
        required: true,
        description: 'The tool key to invoke (returned by List Tools)',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['runTool'] } },
      },
      {
        displayName: 'Image URL',
        name: 'aiVideoToolImageUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'Source image URL',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['runTool'], aiVideoToolKey: ['motion-control', 'talking-avatar'] } },
      },
      {
        displayName: 'Video URL',
        name: 'aiVideoToolVideoUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'Source video URL',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['runTool'], aiVideoToolKey: ['motion-control', 'lip-sync'] } },
      },
      {
        displayName: 'Audio URL',
        name: 'aiVideoToolAudioUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'Source audio URL',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['runTool'], aiVideoToolKey: ['lip-sync', 'talking-avatar'] } },
      },

      // AI Video — jobs
      {
        displayName: 'Status',
        name: 'aiVideoJobStatus',
        type: 'options',
        options: [
          { name: 'Any', value: '' },
          { name: 'Queued', value: 'queued' },
          { name: 'Processing', value: 'processing' },
          { name: 'Completed', value: 'completed' },
          { name: 'Failed', value: 'failed' },
          { name: 'Cancelled', value: 'cancelled' },
        ],
        default: '',
        description: 'Filter jobs by status',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['list'] } },
      },
      {
        displayName: 'Job ID',
        name: 'aiVideoJobId',
        type: 'string',
        default: '',
        required: true,
        description: 'The job_id returned by Generate / Run Tool / List Jobs',
        displayOptions: { show: { resource: ['aiVideo'], operation: ['get', 'delete'] } },
      },

      // Limits — plan entitlements and usage
      {
        displayName:
          'Returns "plan", "limits" (always the same 14 entries, in a stable order) and "usage_reset". Each limits entry carries key, label, used, limit, remaining, scope, is_unlimited, is_on_plan, unit, period, resets_at and note. Read "scope" before acting on "remaining": on an "account" entry (workspaces, social accounts, team members, listening topics, automations, media storage) the number is room left across the whole account, not in this workspace — the eight credit counters are "workspace"-scoped. A null "limit" on its own cannot tell unlimited from not-on-this-plan, so branch on "is_unlimited" and "is_on_plan". "unit" is "bytes" for media_storage and "count" everywhere else; "resets_at" is null when "period" is "lifetime". The request-rate ceiling is not part of this response — it is published on every API call as the "X-RateLimit-Limit" / "X-RateLimit-Remaining" response headers. The response is built live on each request and is not cached.',
        name: 'limitsGetNotice',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['limit'], operation: ['get'] } },
      },

      // Scheduling — best times to post
      {
        displayName:
          'Recommended times are always returned in the workspace timezone (echoed as "timezone" on every slot). The API has no period or timezone parameter — it analyses the accounts\' full available publishing history.',
        name: 'bestTimesNotice',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Accounts',
        name: 'bestTimesAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getSchedulingAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        description: 'Accounts to analyse. Leave empty to analyse every account connected to the workspace.',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Output',
        name: 'bestTimesOutput',
        type: 'options',
        options: [
          { name: 'Ranked Slots (Pooled)', value: 'global' },
          { name: 'Ranked Slots (Pooled + Per Account)', value: 'all' },
          { name: 'Full Response', value: 'raw' },
        ],
        default: 'global',
        description:
          'Ranked Slots returns one item per recommended time, best-first, each with a "scheduled_at" value (YYYY-MM-DD HH:MM:SS) you can feed straight into Post → Create. Full Response returns the raw API payload including the heatmap matrix.',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Pooled Slots',
        name: 'bestTimesGlobalSlots',
        type: 'number',
        default: 5,
        typeOptions: { minValue: 1, maxValue: 24 },
        description: 'How many recommended times to return in the pooled view across all analysed accounts',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Per Account Slots',
        name: 'bestTimesPerAccountSlots',
        type: 'number',
        default: 3,
        typeOptions: { minValue: 1, maxValue: 24 },
        description: 'How many recommended times to return for each analysed account',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
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
      getCarouselAccounts,
      getContentCategories,
      getTeamMembers,
      getFacebookBackgrounds,
      getApprovalWorkflows,
      getSchedulingAccounts,
      getWebhookEventTypes,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let i = 0; i < items.length; i++) {
      try {
      const resource = this.getNodeParameter('resource', i) as string;
      const operation = this.getNodeParameter('operation', i) as string;

      const baseRoot = normalizeBase(BASE_URL);

      // Set by operations that reshape the API payload into multiple output items
      let transformResponse: ((response: any) => Array<Record<string, any>>) | undefined;

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

      if (resource === 'aiImage' && operation === 'listTools') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/images/tools`;
      }

      if (resource === 'aiImage' && operation === 'listModels') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/images/models`;
      }

      if (resource === 'aiImage' && operation === 'brandStatus') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/brand`;
      }

      if (resource === 'aiImage' && operation === 'generate') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const prompt = (this.getNodeParameter('aiImagePrompt', i) as string) || '';
        if (!prompt) throw new NodeOperationError(this.getNode(), 'Prompt is required', { itemIndex: i });
        const imageUrl = (this.getNodeParameter('aiImageImageUrl', i) as string) || '';
        const model = (this.getNodeParameter('aiImageModel', i) as string) || '';
        const useBrand = this.getNodeParameter('aiImageUseBrand', i) as boolean;
        const dimensions = (this.getNodeParameter('aiImageDimensions', i) as string) || '';
        const enhancePrompt = this.getNodeParameter('aiImageEnhancePrompt', i) as boolean;

        const body: Record<string, any> = { prompt };
        if (imageUrl) body.image_url = imageUrl;
        if (model) body.model = model;
        if (useBrand) body.use_brand = useBrand;
        if (dimensions) body.dimensions = dimensions;
        if (enhancePrompt) body.enhance_prompt = enhancePrompt;

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/images/generate`;
        options.body = body;
      }

      if (resource === 'aiImage' && operation === 'runTool') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const toolKey = this.getNodeParameter('aiImageToolKey', i) as string;
        const body: Record<string, any> = {};

        if (toolKey === 'image-to-image') {
          const prompt = (this.getNodeParameter('aiImageToolPrompt', i) as string) || '';
          if (!prompt) throw new NodeOperationError(this.getNode(), 'Prompt is required for this tool', { itemIndex: i });
          const attachmentsRaw = (this.getNodeParameter('aiImageToolAttachments', i) as string) || '';
          const attachments = parseCommaSeparated(attachmentsRaw);
          if (attachments.length === 0) throw new NodeOperationError(this.getNode(), 'At least one attachment URL is required for this tool', { itemIndex: i });
          body.prompt = prompt;
          body.attachments = attachments;
          const model = (this.getNodeParameter('aiImageToolModel', i) as string) || '';
          if (model) body.model = model;
          const enhancePrompt = this.getNodeParameter('aiImageToolEnhancePrompt', i) as boolean;
          if (enhancePrompt) body.enhance_prompt = enhancePrompt;
        }

        if (toolKey === 'remove-background' || toolKey === 'upscale' || toolKey === 'headshot') {
          const imageUrl = (this.getNodeParameter('aiImageToolImageUrl', i) as string) || '';
          if (!imageUrl) throw new NodeOperationError(this.getNode(), 'Image URL is required for this tool', { itemIndex: i });
          body.image_url = imageUrl;
        }

        if (toolKey === 'upscale' || toolKey === 'headshot' || toolKey === 'face-swap' || toolKey === 'product-image') {
          const resolution = (this.getNodeParameter('aiImageToolResolution', i) as string) || '';
          if (resolution) body.resolution = resolution;
        }

        if (toolKey === 'headshot' || toolKey === 'product-image') {
          const aspectRatio = (this.getNodeParameter('aiImageToolAspectRatio', i) as string) || '';
          if (aspectRatio) body.aspect_ratio = aspectRatio;
        }

        if (toolKey === 'face-swap') {
          const targetImageUrl = (this.getNodeParameter('aiImageToolTargetImageUrl', i) as string) || '';
          if (!targetImageUrl) throw new NodeOperationError(this.getNode(), 'Target Image URL is required for this tool', { itemIndex: i });
          const faceImageUrl = (this.getNodeParameter('aiImageToolFaceImageUrl', i) as string) || '';
          if (!faceImageUrl) throw new NodeOperationError(this.getNode(), 'Face Image URL is required for this tool', { itemIndex: i });
          body.target_image_url = targetImageUrl;
          body.face_image_url = faceImageUrl;
        }

        if (toolKey === 'outfit-swap') {
          const targetImageUrl = (this.getNodeParameter('aiImageToolTargetImageUrl', i) as string) || '';
          if (!targetImageUrl) throw new NodeOperationError(this.getNode(), 'Target Image URL is required for this tool', { itemIndex: i });
          const outfitImageUrl = (this.getNodeParameter('aiImageToolOutfitImageUrl', i) as string) || '';
          if (!outfitImageUrl) throw new NodeOperationError(this.getNode(), 'Outfit Image URL is required for this tool', { itemIndex: i });
          body.target_image_url = targetImageUrl;
          body.outfit_image_url = outfitImageUrl;
        }

        if (toolKey === 'product-image') {
          const productImageUrl = (this.getNodeParameter('aiImageToolProductImageUrl', i) as string) || '';
          if (!productImageUrl) throw new NodeOperationError(this.getNode(), 'Product Image URL is required for this tool', { itemIndex: i });
          body.product_image_url = productImageUrl;
          const referenceImageUrl = (this.getNodeParameter('aiImageToolReferenceImageUrl', i) as string) || '';
          if (referenceImageUrl) body.reference_image_url = referenceImageUrl;
          const instructions = (this.getNodeParameter('aiImageToolInstructions', i) as string) || '';
          if (instructions) body.instructions = instructions;
        }

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/images/tools/${toolKey}`;
        options.body = body;
      }

      if (resource === 'aiVideo' && operation === 'listTools') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/videos/tools`;
      }

      if (resource === 'aiVideo' && operation === 'listModels') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/videos/models`;
      }

      if (resource === 'aiVideo' && operation === 'estimate') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const durationSeconds = this.getNodeParameter('aiVideoDuration', i) as number;
        const model = (this.getNodeParameter('aiVideoModel', i) as string) || '';
        const resolution = (this.getNodeParameter('aiVideoResolution', i) as string) || '';
        const aspectRatio = (this.getNodeParameter('aiVideoAspectRatio', i) as string) || '';
        const generationMode = (this.getNodeParameter('aiVideoGenerationMode', i) as string) || '';
        const enableAudio = this.getNodeParameter('aiVideoEnableAudio', i) as boolean;
        const enhancePrompt = this.getNodeParameter('aiVideoEnhancePrompt', i) as boolean;
        const body: Record<string, any> = {};
        if (durationSeconds != null) body.duration_seconds = durationSeconds;
        if (model) body.model = model;
        if (resolution) body.resolution = resolution;
        if (aspectRatio) body.aspect_ratio = aspectRatio;
        if (generationMode) body.generation_mode = generationMode;
        if (enableAudio) body.enable_audio = enableAudio;
        if (enhancePrompt) body.enhance_prompt = enhancePrompt;
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/videos/estimate`;
        options.body = body;
      }

      if (resource === 'aiVideo' && operation === 'generate') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const prompt = (this.getNodeParameter('aiVideoPrompt', i) as string) || '';
        if (!prompt) throw new NodeOperationError(this.getNode(), 'Prompt is required', { itemIndex: i });
        const imageUrl = (this.getNodeParameter('aiVideoImageUrl', i) as string) || '';
        const referenceImageUrlsRaw = (this.getNodeParameter('aiVideoReferenceImageUrls', i) as string) || '';
        const model = (this.getNodeParameter('aiVideoModel', i) as string) || '';
        const durationSeconds = this.getNodeParameter('aiVideoDuration', i) as number;
        const resolution = (this.getNodeParameter('aiVideoResolution', i) as string) || '';
        const aspectRatio = (this.getNodeParameter('aiVideoAspectRatio', i) as string) || '';
        const enableAudio = this.getNodeParameter('aiVideoEnableAudio', i) as boolean;
        const enhancePrompt = this.getNodeParameter('aiVideoEnhancePrompt', i) as boolean;
        const style = (this.getNodeParameter('aiVideoStyle', i) as string) || '';
        const useBrand = this.getNodeParameter('aiVideoUseBrand', i) as boolean;

        const body: Record<string, any> = { prompt };
        const referenceImageUrls = parseCommaSeparated(referenceImageUrlsRaw);
        if (imageUrl && referenceImageUrls.length > 0) {
          throw new NodeOperationError(this.getNode(), 'Image URL and Reference Image URLs are mutually exclusive', { itemIndex: i });
        }
        if (imageUrl) body.image_url = imageUrl;
        if (referenceImageUrls.length > 0) body.reference_image_urls = referenceImageUrls;
        if (model) body.model = model;
        if (durationSeconds != null) body.duration_seconds = durationSeconds;
        if (resolution) body.resolution = resolution;
        if (aspectRatio) body.aspect_ratio = aspectRatio;
        if (enableAudio) body.enable_audio = enableAudio;
        if (enhancePrompt) body.enhance_prompt = enhancePrompt;
        if (style) body.style = style;
        if (useBrand) body.use_brand = useBrand;

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/videos/generate`;
        options.body = body;
      }

      if (resource === 'aiVideo' && operation === 'runTool') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const toolKey = this.getNodeParameter('aiVideoToolKey', i) as string;
        const body: Record<string, any> = {};
        if (toolKey === 'motion-control' || toolKey === 'talking-avatar') {
          const imageUrl = (this.getNodeParameter('aiVideoToolImageUrl', i) as string) || '';
          if (!imageUrl) throw new NodeOperationError(this.getNode(), 'Image URL is required for this tool', { itemIndex: i });
          body.image_url = imageUrl;
        }
        if (toolKey === 'motion-control' || toolKey === 'lip-sync') {
          const videoUrl = (this.getNodeParameter('aiVideoToolVideoUrl', i) as string) || '';
          if (!videoUrl) throw new NodeOperationError(this.getNode(), 'Video URL is required for this tool', { itemIndex: i });
          body.video_url = videoUrl;
        }
        if (toolKey === 'lip-sync' || toolKey === 'talking-avatar') {
          const audioUrl = (this.getNodeParameter('aiVideoToolAudioUrl', i) as string) || '';
          if (!audioUrl) throw new NodeOperationError(this.getNode(), 'Audio URL is required for this tool', { itemIndex: i });
          body.audio_url = audioUrl;
        }
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/videos/tools/${toolKey}`;
        options.body = body;
      }

      if (resource === 'aiVideo' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const status = (this.getNodeParameter('aiVideoJobStatus', i) as string) || '';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/jobs`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (status) qs.status = status;
        options.qs = qs;
      }

      if (resource === 'aiVideo' && operation === 'get') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const jobId = (this.getNodeParameter('aiVideoJobId', i) as string) || '';
        if (!jobId) throw new NodeOperationError(this.getNode(), 'Job ID is required', { itemIndex: i });
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/jobs/${jobId}`;
      }

      if (resource === 'aiVideo' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const jobId = (this.getNodeParameter('aiVideoJobId', i) as string) || '';
        if (!jobId) throw new NodeOperationError(this.getNode(), 'Job ID is required', { itemIndex: i });
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/ai/jobs/${jobId}`;
      }

      if (resource === 'approvalWorkflow' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'workspace' && operation === 'list') {
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'workspace' && operation === 'create') {
        const name = this.getNodeParameter('wsName', i) as string;
        const logo = this.getNodeParameter('wsLogo', i) as string;
        const timezone = this.getNodeParameter('wsTimezone', i) as string;
        if (!name || !logo || !timezone) {
          throw new NodeOperationError(this.getNode(), 'Name, Logo URL and Timezone are required to create a workspace', { itemIndex: i });
        }
        const body: Record<string, any> = { name, logo, timezone };
        const superAdminId = this.getNodeParameter('wsSuperAdminId', i) as string;
        if (superAdminId) body.super_admin_id = superAdminId;
        const note = this.getNodeParameter('wsNote', i) as string;
        if (note) body.note = note;
        const ig = this.getNodeParameter('wsInstagramPostingMethod', i) as string;
        if (ig) body.instagram_posting_method = ig;
        const firstDay = this.getNodeParameter('wsFirstDay', i) as string;
        if (firstDay) {
          body.first_day = { day: firstDay, key: WEEK_DAYS.indexOf(firstDay) };
        }
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces`;
        options.body = body;
      }

      if (resource === 'workspace' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceTargetId', i) as string;
        const body: Record<string, any> = {};
        const name = this.getNodeParameter('wsName', i) as string;
        if (name) body.name = name;
        const logo = this.getNodeParameter('wsLogo', i) as string;
        if (logo) body.logo = logo;
        const timezone = this.getNodeParameter('wsTimezone', i) as string;
        if (timezone) body.timezone = timezone;
        const note = this.getNodeParameter('wsNote', i) as string;
        if (note) body.note = note;
        const ig = this.getNodeParameter('wsInstagramPostingMethod', i) as string;
        if (ig) body.instagram_posting_method = ig;
        const firstDay = this.getNodeParameter('wsFirstDay', i) as string;
        if (firstDay) {
          body.first_day = { day: firstDay, key: WEEK_DAYS.indexOf(firstDay) };
        }
        if (Object.keys(body).length === 0) {
          throw new NodeOperationError(this.getNode(), 'Provide at least one field to update', { itemIndex: i });
        }
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}`;
        options.body = body;
      }

      if (resource === 'workspace' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceTargetId', i) as string;
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}`;
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

      if (resource === 'socialAccount' && operation === 'remove') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const accountId = this.getNodeParameter('accountId', i) as string;
        if (!accountId) throw new NodeOperationError(this.getNode(), 'Account is required', { itemIndex: i });
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts/${accountId}`;
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

      if (resource === 'label' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const name = (this.getNodeParameter('labelName', i) as string).trim();
        const color = this.getNodeParameter('labelColor', i) as string;
        if (!name) throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex: i });
        if (!color) throw new NodeOperationError(this.getNode(), 'Color is required', { itemIndex: i });
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels`;
        options.body = { name, color };
      }

      if (resource === 'label' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const labelId = (this.getNodeParameter('labelId', i) as string).trim();
        if (!labelId) throw new NodeOperationError(this.getNode(), 'Label ID is required', { itemIndex: i });
        const name = (this.getNodeParameter('labelName', i) as string).trim();
        const color = (this.getNodeParameter('labelColor', i) as string).trim();
        const body: Record<string, any> = {};
        if (name) body.name = name;
        if (color) body.color = color;
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels/${labelId}`;
        options.body = body;
      }

      if (resource === 'label' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const labelId = (this.getNodeParameter('labelId', i) as string).trim();
        if (!labelId) throw new NodeOperationError(this.getNode(), 'Label ID is required', { itemIndex: i });
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels/${labelId}`;
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

      if (resource === 'campaign' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const name = (this.getNodeParameter('campaignName', i) as string).trim();
        const color = this.getNodeParameter('campaignColor', i) as string;
        if (!name) throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex: i });
        if (!color) throw new NodeOperationError(this.getNode(), 'Color is required', { itemIndex: i });
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns`;
        options.body = { name, color };
      }

      if (resource === 'campaign' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const campaignId = (this.getNodeParameter('campaignId', i) as string).trim();
        if (!campaignId) throw new NodeOperationError(this.getNode(), 'Campaign ID is required', { itemIndex: i });
        const name = (this.getNodeParameter('campaignName', i) as string).trim();
        const color = (this.getNodeParameter('campaignColor', i) as string).trim();
        const body: Record<string, any> = {};
        if (name) body.name = name;
        if (color) body.color = color;
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns/${campaignId}`;
        options.body = body;
      }

      if (resource === 'campaign' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const campaignId = (this.getNodeParameter('campaignId', i) as string).trim();
        if (!campaignId) throw new NodeOperationError(this.getNode(), 'Campaign ID is required', { itemIndex: i });
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns/${campaignId}`;
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
        if (!mediaUrl) throw new NodeOperationError(this.getNode(), 'Media URL is required', { itemIndex: i });
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

      if (resource === 'teamMember' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const role = this.getNodeParameter('teamRole', i) as string;
        const membership = this.getNodeParameter('teamMembership', i) as string;
        const email = (this.getNodeParameter('teamEmail', i) as string).trim();
        if (!email) throw new NodeOperationError(this.getNode(), 'Email is required', { itemIndex: i });
        const permissions = parseJsonObject(this.getNode(), this.getNodeParameter('teamPermissions', i));
        const body: Record<string, any> = { role, membership, email };
        if (permissions && Object.keys(permissions).length) body.permissions = permissions;
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members`;
        options.body = body;
      }

      if (resource === 'teamMember' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const memberId = this.getNodeParameter('teamMemberId', i) as string;
        if (!memberId) throw new NodeOperationError(this.getNode(), 'Member ID is required', { itemIndex: i });
        const role = this.getNodeParameter('teamRole', i) as string;
        const membership = this.getNodeParameter('teamMembership', i) as string;
        const permissions = parseJsonObject(this.getNode(), this.getNodeParameter('teamPermissions', i));
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members/${memberId}`;
        options.body = { role, membership, permissions: permissions || {} };
      }

      if (resource === 'teamMember' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const memberId = this.getNodeParameter('teamMemberId', i) as string;
        if (!memberId) throw new NodeOperationError(this.getNode(), 'Member ID is required', { itemIndex: i });
        const confirmed = this.getNodeParameter('teamConfirmed', i) as boolean;
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members/${memberId}`;
        if (confirmed) options.qs = { confirmed: 'true' };
      }

      if (resource === 'comment' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('commentPostId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        if (!postId) throw new NodeOperationError(this.getNode(), 'Post ID is required', { itemIndex: i });
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
        if (!postId) throw new NodeOperationError(this.getNode(), 'Post ID is required', { itemIndex: i });
        if (!commentText) throw new NodeOperationError(this.getNode(), 'Comment text is required', { itemIndex: i });
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
        const statusesRaw = this.getNodeParameter('statusesCsv', i, []) as string | string[];
        const dateFrom = (this.getNodeParameter('dateFrom', i) as string) || '';
        const dateTo = (this.getNodeParameter('dateTo', i) as string) || '';
        const approvalAssignedTo = (this.getNodeParameter('approvalAssignedTo', i, '') as string) || '';
        const approvalRequestedBy = (this.getNodeParameter('approvalRequestedBy', i, '') as string) || '';
        const labelsCsv = (this.getNodeParameter('labelsCsv', i, '') as string) || '';
        const campaignsCsv = (this.getNodeParameter('campaignsCsv', i, '') as string) || '';
        const contentCategoryCsv = (this.getNodeParameter('contentCategoryCsv', i, '') as string) || '';
        const createdByCsv = (this.getNodeParameter('createdByCsv', i, '') as string) || '';
        const commentStatus = (this.getNodeParameter('commentStatus', i, 'all') as string) || 'all';

        // Build query string manually to ensure proper array format
        const qsParts: string[] = [`page=${page}`, `per_page=${perPage}`];
        const statusesArr = Array.isArray(statusesRaw)
          ? statusesRaw
          : String(statusesRaw).split(',').map(s => s.trim()).filter(Boolean);
        Array.from(new Set(statusesArr)).forEach((s) => qsParts.push(`status[]=${encodeURIComponent(s)}`));
        if (dateFrom) qsParts.push(`date_from=${encodeURIComponent(dateFrom)}`);
        if (dateTo) qsParts.push(`date_to=${encodeURIComponent(dateTo)}`);

        const appendCsvAsArray = (name: string, raw: string) => {
          if (!raw.trim()) return;
          raw.split(',')
            .map(s => s.trim().replace(/^["']+|["']+$/g, '').trim())
            .filter(Boolean)
            .forEach((id) => qsParts.push(`${name}[]=${encodeURIComponent(id)}`));
        };

        appendCsvAsArray('approval_assigned_to', approvalAssignedTo);
        appendCsvAsArray('approval_requested_by', approvalRequestedBy);
        appendCsvAsArray('labels', labelsCsv);
        appendCsvAsArray('campaigns', campaignsCsv);
        appendCsvAsArray('content_category', contentCategoryCsv);
        appendCsvAsArray('created_by', createdByCsv);

        if (commentStatus && commentStatus !== 'all') {
          qsParts.push(`comment_status=${encodeURIComponent(commentStatus)}`);
        }

        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts?${qsParts.join('&')}`;
      }

      if (resource === 'post' && (operation === 'create' || operation === 'update')) {
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
            throw new NodeOperationError(this.getNode(), 'First Comment Message is required when Enable First Comment is true', { itemIndex: i });
          }

          // First comment accounts required only when content_category is NOT used
          if (firstCommentAccountIds.length === 0 && !contentCategoryId) {
            throw new NodeOperationError(this.getNode(), 'First Comment Accounts is required when Enable First Comment is true and no Content Category is selected', { itemIndex: i });
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
          throw new NodeOperationError(this.getNode(), 'Either Accounts or Content Category must be selected', { itemIndex: i });
        }

        // Content validation - ensure at least one content type is present
        const hasText = contentText && contentText.trim().length > 0;
        const hasImages = mediaImages && mediaImages.length > 0;
        const hasVideo = mediaVideo && mediaVideo.trim().length > 0;

        if (!hasText && !hasImages && !hasVideo) {
          throw new NodeOperationError(this.getNode(), 'At least one of the following must be provided: Content Text, Media Images, or Media Video', { itemIndex: i });
        }

        // Validate scheduled date format
        if (scheduledAt && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(scheduledAt)) {
          throw new NodeOperationError(this.getNode(), 'Scheduled At must be in format: YYYY-MM-DD HH:MM:SS (e.g., 2025-10-11 11:15:00)', { itemIndex: i });
        }

        // Validate first comment accounts overlap with main accounts (only if accounts provided)
        if (hasFirstComment && firstCommentAccountIds.length > 0 && accounts.length > 0) {
          const mainAccountSet = new Set(accounts);
          const validCommentAccounts = firstCommentAccountIds.filter(id => mainAccountSet.has(id));

          if (validCommentAccounts.length === 0) {
            throw new NodeOperationError(this.getNode(), 'First Comment Accounts must include at least one account from the selected main Accounts', { itemIndex: i });
          }

          // Use only valid overlapping accounts
          firstCommentAccountIds = validCommentAccounts;
        }

        const postType = (this.getNodeParameter('postType', i, 'feed') as string) || 'feed';

        if (operation === 'update') {
          const updatePostId = (this.getNodeParameter('updatePostId', i) as string).trim();
          if (!updatePostId) throw new NodeOperationError(this.getNode(), 'Post ID is required to update a post', { itemIndex: i });
          options.method = 'PUT';
          options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${updatePostId}`;
        } else {
          options.method = 'POST';
          options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
        }
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

        // scheduling.repeat — supported on immediate and scheduled posts only,
        // and never inherited on update: leaving the toggle off drops an
        // existing repeat schedule instead of preserving it.
        // The toggle is hidden for publish types the API refuses repeat on, so a
        // stale stored value is ignored rather than failing the request.
        const canRepeat = publishType === 'now' || publishType === 'scheduled';
        const enableRepeat = canRepeat && (this.getNodeParameter('enableRepeat', i, false) as boolean);
        if (enableRepeat) {
          const repeatType = (this.getNodeParameter('repeatType', i, 'Week') as string) || 'Week';
          const repeatTimes = Number(this.getNodeParameter('repeatTimes', i, 2));
          const repeatGap = Number(this.getNodeParameter('repeatGap', i, 1));
          if (!Number.isInteger(repeatTimes) || repeatTimes < 1 || repeatTimes > 30) {
            throw new NodeOperationError(this.getNode(), 'Repeat Times must be a whole number between 1 and 30', { itemIndex: i });
          }
          if (!Number.isInteger(repeatGap) || repeatGap < 1 || repeatGap > 99) {
            throw new NodeOperationError(this.getNode(), 'Repeat Interval must be a whole number between 1 and 99', { itemIndex: i });
          }
          if (repeatType === 'Day' && repeatGap < 3) {
            throw new NodeOperationError(this.getNode(), 'A Day repeat requires an interval of at least 3 days', { itemIndex: i });
          }
          (options.body as any).scheduling.repeat = {
            enabled: true,
            type: repeatType,
            times: repeatTimes,
            gap: repeatGap,
          };
        }

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

        // Facebook carousel post (2-10 link cards on Facebook Pages)
        const hasFacebookCarousel = this.getNodeParameter('hasFacebookCarousel', i, false) as boolean;
        if (hasFacebookCarousel) {
          const carouselCardsRaw = this.getNodeParameter('carouselCards', i, {}) as any;
          const rawCards: any[] = Array.isArray(carouselCardsRaw?.card) ? carouselCardsRaw.card : [];

          const cards = rawCards.map((c, idx) => {
            const image = String(c?.image ?? '').trim();
            const link = String(c?.link ?? '').trim();
            if (!image || !link) {
              throw new NodeOperationError(this.getNode(), `Carousel card ${idx + 1} requires both Image URL and Destination URL`, { itemIndex: i });
            }
            return {
              image,
              title: String(c?.title ?? '').trim(),
              description: String(c?.description ?? '').trim(),
              link,
            };
          });

          if (cards.length < 2 || cards.length > 10) {
            throw new NodeOperationError(this.getNode(), `Facebook carousel requires between 2 and 10 cards (got ${cards.length})`, { itemIndex: i });
          }

          const carouselAccountsRaw = this.getNodeParameter('carouselAccounts', i, []) as string | string[];
          const carouselAccounts = Array.isArray(carouselAccountsRaw)
            ? carouselAccountsRaw.map((v) => String(v).trim()).filter(Boolean)
            : parseCommaSeparated(carouselAccountsRaw);
          const carouselCallToAction = (this.getNodeParameter('carouselCallToAction', i, 'NO_BUTTON') as string) || 'NO_BUTTON';
          const carouselEndCard = this.getNodeParameter('carouselEndCard', i, false) as boolean;
          const carouselEndCardUrl = (this.getNodeParameter('carouselEndCardUrl', i, '') as string).trim();

          (options.body as any).facebook_options = (options.body as any).facebook_options || {};
          (options.body as any).facebook_options.carousel = {
            is_carousel_post: true,
            cards,
            call_to_action: carouselCallToAction,
            end_card: carouselEndCard,
            ...(carouselEndCardUrl ? { end_card_url: carouselEndCardUrl } : {}),
            ...(carouselAccounts.length ? { accounts: carouselAccounts } : {}),
          };
        }

        // Facebook Reel collaborators (facebook_options.collaborators, max 10) — gated by the Facebook options toggle
        if (hasFacebookBackground) {
          const facebookCollaborators = parseCommaSeparated(this.getNodeParameter('facebookCollaborators', i, '') as unknown);
          if (facebookCollaborators.length > 0) {
            if (facebookCollaborators.length > 10) {
              throw new NodeOperationError(this.getNode(), `Facebook reel collaborators supports at most 10 (got ${facebookCollaborators.length})`, { itemIndex: i });
            }
            (options.body as any).facebook_options = (options.body as any).facebook_options || {};
            (options.body as any).facebook_options.collaborators = facebookCollaborators;
          }
        }

        // Instagram collaborators (instagram_options.collaborators, max 3) and trial reel (instagram_options.trial_reel) — gated by the Instagram options toggle
        const hasInstagramOptions = this.getNodeParameter('hasInstagramOptions', i, false) as boolean;
        if (hasInstagramOptions) {
          const instagramCollaborators = parseCommaSeparated(this.getNodeParameter('instagramCollaborators', i, '') as unknown);
          const instagramTrialReelEnabled = this.getNodeParameter('instagramTrialReelEnabled', i, false) as boolean;

          if (instagramCollaborators.length > 0 && instagramTrialReelEnabled) {
            throw new NodeOperationError(this.getNode(), 'Instagram Trial Reel is mutually exclusive with Instagram Collaborators on the same request', { itemIndex: i });
          }

          if (instagramTrialReelEnabled && postType.includes('story')) {
            throw new NodeOperationError(this.getNode(), 'Instagram Trial Reel is mutually exclusive with sharing to Story on the same request', { itemIndex: i });
          }

          if (instagramCollaborators.length > 0) {
            if (instagramCollaborators.length > 3) {
              throw new NodeOperationError(this.getNode(), `Instagram collaborators supports at most 3 (got ${instagramCollaborators.length})`, { itemIndex: i });
            }
            (options.body as any).instagram_options = { collaborators: instagramCollaborators };
          }

          if (instagramTrialReelEnabled) {
            const graduationStrategy = (this.getNodeParameter('instagramTrialReelGraduationStrategy', i, 'SS_PERFORMANCE') as string) || 'SS_PERFORMANCE';
            (options.body as any).instagram_options = (options.body as any).instagram_options || {};
            (options.body as any).instagram_options.trial_reel = {
              enabled: true,
              graduation_strategy: graduationStrategy,
            };
          }
        }

        // Per-platform content overrides (platform_overrides.<platform>.content.{text,post_type,media})
        const platformOverrides = parseJsonObject(this.getNode(), this.getNodeParameter('platformOverrides', i, '{}') as unknown, 'Platform Overrides');
        if (Object.keys(platformOverrides).length > 0) {
          (options.body as any).platform_overrides = platformOverrides;
        }

        // LinkedIn options (title and/or poll) — gated by the LinkedIn options toggle
        const hasLinkedinOptions = this.getNodeParameter('hasLinkedinOptions', i, false) as boolean;
        if (hasLinkedinOptions) {
          const linkedinOptions: Record<string, any> = {};
          const linkedinTitle = ((this.getNodeParameter('linkedinTitle', i, '') as string) || '').trim();
          if (linkedinTitle) {
            if (linkedinTitle.length > 255) {
              throw new NodeOperationError(this.getNode(), 'LinkedIn Title supports at most 255 characters', { itemIndex: i });
            }
            linkedinOptions.title = linkedinTitle;
          }

          const linkedinEnablePoll = this.getNodeParameter('linkedinEnablePoll', i, false) as boolean;
          if (linkedinEnablePoll) {
            const pollQuestion = ((this.getNodeParameter('linkedinPollQuestion', i, '') as string) || '').trim();
            if (!pollQuestion) {
              throw new NodeOperationError(this.getNode(), 'Poll Question is required when LinkedIn Poll is enabled', { itemIndex: i });
            }
            if (pollQuestion.length > 140) {
              throw new NodeOperationError(this.getNode(), 'Poll Question supports at most 140 characters', { itemIndex: i });
            }
            const pollOptions = parseCommaSeparated(this.getNodeParameter('linkedinPollOptions', i, '') as unknown);
            if (pollOptions.length < 2 || pollOptions.length > 4) {
              throw new NodeOperationError(this.getNode(), `LinkedIn poll requires between 2 and 4 options (got ${pollOptions.length})`, { itemIndex: i });
            }
            if (pollOptions.some((opt) => opt.length > 30)) {
              throw new NodeOperationError(this.getNode(), 'Each LinkedIn poll option supports at most 30 characters', { itemIndex: i });
            }
            const pollDuration = (this.getNodeParameter('linkedinPollDuration', i, 'ONE_DAY') as string) || 'ONE_DAY';
            linkedinOptions.poll = {
              question: pollQuestion,
              options: pollOptions,
              duration: pollDuration,
            };
          }

          if (Object.keys(linkedinOptions).length > 0) {
            (options.body as any).linkedin_options = linkedinOptions;
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
            throw new NodeOperationError(this.getNode(), 'At least one Approver ID is required when Send for Approval is enabled', { itemIndex: i });
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

        // Approval workflow (multi-level) — mutually exclusive with the legacy approval above
        const useApprovalWorkflow = this.getNodeParameter('useApprovalWorkflow', i, false) as boolean;
        if (useApprovalWorkflow) {
          if (sendForApproval) {
            throw new NodeOperationError(this.getNode(), 'Use either "Send for Approval" (legacy) or "Use Approval Workflow" — they are mutually exclusive', { itemIndex: i });
          }
          const workflowId = ((this.getNodeParameter('approvalWorkflowId', i, '') as string) || '').trim();
          const workflowAction = operation === 'update'
            ? ((this.getNodeParameter('approvalWorkflowAction', i, '') as string) || '').trim()
            : '';
          const workflowNotes = ((this.getNodeParameter('approvalWorkflowNotes', i, '') as string) || '').trim();

          if (workflowId && workflowAction) {
            throw new NodeOperationError(this.getNode(), 'Provide exactly one of Approval Workflow (attach) or Workflow Action — not both', { itemIndex: i });
          }
          if (!workflowId && !workflowAction) {
            throw new NodeOperationError(this.getNode(), 'Approval Workflow requires either a workflow to attach or a Workflow Action', { itemIndex: i });
          }

          const approvalWorkflow: Record<string, any> = workflowId
            ? { workflow_id: workflowId }
            : { workflow_action: workflowAction };
          if (workflowNotes) {
            approvalWorkflow.notes = workflowNotes;
          }
          (options.body as any).approval_workflow = approvalWorkflow;
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

      if (resource === 'post' && operation === 'get') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = ((this.getNodeParameter('postId', i) as string) || '').trim();
        if (!postId) throw new NodeOperationError(this.getNode(), 'Post ID is required', { itemIndex: i });
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}`;
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

        if (!planId) throw new NodeOperationError(this.getNode(), 'Post/Plan ID is required', { itemIndex: i });
        if (!approvalAction) throw new NodeOperationError(this.getNode(), 'Action is required (approve or reject)', { itemIndex: i });

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${planId}/approval`;
        const approvalBody: Record<string, unknown> = { action: approvalAction };
        if (comment) {
          approvalBody.comment = comment;
        }
        options.body = approvalBody;
      }

      if (resource === 'scheduling' && operation === 'bestTimes') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const globalSlots = this.getNodeParameter('bestTimesGlobalSlots', i, 5) as number;
        const perAccountSlots = this.getNodeParameter('bestTimesPerAccountSlots', i, 3) as number;
        const output = (this.getNodeParameter('bestTimesOutput', i, 'global') as string) || 'global';

        const entities = parseSchedulingEntityRefs(this.getNodeParameter('bestTimesAccounts', i, []) as unknown);

        // Account ids typed by hand or supplied by an expression arrive without a
        // platform; resolve those against the workspace's connected accounts.
        const unresolved = entities.filter((entity) => !entity.type);
        if (unresolved.length > 0) {
          const accountsResponse = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIALS_TYPE, {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json' },
            timeout: 60000,
          });
          const accountList: any[] = Array.isArray(accountsResponse) ? accountsResponse : (accountsResponse?.data || []);
          const platformById = new Map<string, string>();
          for (const account of accountList) {
            const id = account?._id;
            const platform = String(account?.platform || account?.provider || '').toLowerCase();
            if (id && platform) platformById.set(String(id), platform);
          }
          for (const entity of unresolved) {
            const platform = platformById.get(entity.id);
            if (!platform) {
              throw new NodeOperationError(this.getNode(), `Account "${entity.id}" is not connected to workspace ${workspaceId}. Select accounts from the dropdown, or pass account IDs returned by Social Account → List.`, { itemIndex: i });
            }
            if (!SCHEDULING_PLATFORMS.includes(platform)) {
              throw new NodeOperationError(this.getNode(), `Account "${entity.id}" is a ${platform} connection, which the best-times analysis does not support. Supported platforms: ${SCHEDULING_PLATFORMS.join(', ')}.`, { itemIndex: i });
            }
            entity.type = platform;
          }
        }

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/scheduling/optimal-times`;
        options.body = {
          global_slots: globalSlots,
          per_account_slots: perAccountSlots,
          // Omitting entities makes the API analyse every connected account
          ...(entities.length > 0 ? { entities: entities.map(({ id, type }) => ({ id, type })) } : {}),
        };

        if (output !== 'raw') {
          transformResponse = (body) => flattenOptimalTimes(body, output === 'all');
        }
      }

      if (resource === 'contentCategory' && operation === 'get') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}`;
      }

      if (resource === 'contentCategory' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const name = ((this.getNodeParameter('categoryName', i) as string) || '').trim();
        const color = (this.getNodeParameter('categoryColor', i) as string) || '';
        if (!name) throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex: i });
        if (!color) throw new NodeOperationError(this.getNode(), 'Color is required', { itemIndex: i });
        const allowedMemberIds = parseCommaSeparated(this.getNodeParameter('categoryAllowedMembers', i, []) as unknown);
        const categoryAccounts = parseCommaSeparated(this.getNodeParameter('categoryAccounts', i, []) as unknown);
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories`;
        options.body = {
          name,
          color,
          ...(allowedMemberIds.length ? { allowed_member_ids: allowedMemberIds } : {}),
          ...(categoryAccounts.length ? { accounts: categoryAccounts } : {}),
        };
      }

      if (resource === 'contentCategory' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        const name = ((this.getNodeParameter('categoryName', i, '') as string) || '').trim();
        const color = ((this.getNodeParameter('categoryColor', i, '') as string) || '').trim();
        const allowedMemberIds = parseCommaSeparated(this.getNodeParameter('categoryAllowedMembers', i, []) as unknown);
        const categoryAccounts = parseCommaSeparated(this.getNodeParameter('categoryAccounts', i, []) as unknown);
        const body: Record<string, any> = {};
        if (name) body.name = name;
        if (color) body.color = color;
        if (allowedMemberIds.length) body.allowed_member_ids = allowedMemberIds;
        if (categoryAccounts.length) body.accounts = categoryAccounts;
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}`;
        options.body = body;
      }

      if (resource === 'contentCategory' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}`;
      }

      if (resource === 'contentCategory' && operation === 'shuffle') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        // A category with nothing upcoming is still a success: shuffled_posts_count is 0.
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}/shuffle`;
      }

      if (resource === 'contentCategorySlot' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}/slots`;
      }

      if (resource === 'contentCategorySlot' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        const day = (this.getNodeParameter('slotDay', i) as string) || '';
        const hour = Number(this.getNodeParameter('slotHour', i));
        const minute = Number(this.getNodeParameter('slotMinute', i));
        const period = (this.getNodeParameter('slotPeriod', i) as string) || '';
        if (!Number.isInteger(hour) || hour < 0 || hour > 12) {
          throw new NodeOperationError(this.getNode(), 'Hour must be an integer between 0 and 12 (12-hour clock)', { itemIndex: i });
        }
        if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
          throw new NodeOperationError(this.getNode(), 'Minute must be an integer between 0 and 59', { itemIndex: i });
        }
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}/slots`;
        options.body = { day, hour, minute, period };
      }

      if (resource === 'contentCategorySlot' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        const slotId = ((this.getNodeParameter('slotId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        if (!slotId) throw new NodeOperationError(this.getNode(), 'Slot ID is required', { itemIndex: i });
        const fields = this.getNodeParameter('slotUpdateFields', i, {}) as Record<string, any>;
        const body: Record<string, any> = {};
        if (typeof fields.day === 'string' && fields.day) body.day = fields.day;
        if (typeof fields.period === 'string' && fields.period) body.period = fields.period;
        if (fields.hour !== undefined && fields.hour !== null && fields.hour !== '') {
          const hour = Number(fields.hour);
          if (!Number.isInteger(hour) || hour < 0 || hour > 12) {
            throw new NodeOperationError(this.getNode(), 'Hour must be an integer between 0 and 12 (12-hour clock)', { itemIndex: i });
          }
          body.hour = hour;
        }
        if (fields.minute !== undefined && fields.minute !== null && fields.minute !== '') {
          const minute = Number(fields.minute);
          if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
            throw new NodeOperationError(this.getNode(), 'Minute must be an integer between 0 and 59', { itemIndex: i });
          }
          body.minute = minute;
        }
        if (Object.keys(body).length === 0) throw new NodeOperationError(this.getNode(), 'Add at least one field to Update Fields', { itemIndex: i });
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}/slots/${slotId}`;
        options.body = body;
      }

      if (resource === 'contentCategorySlot' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        const slotId = ((this.getNodeParameter('slotId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        if (!slotId) throw new NodeOperationError(this.getNode(), 'Slot ID is required', { itemIndex: i });
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}/slots/${slotId}`;
      }

      if (resource === 'contentCategorySlot' && operation === 'next') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const categoryId = ((this.getNodeParameter('categoryId', i) as string) || '').trim();
        if (!categoryId) throw new NodeOperationError(this.getNode(), 'Content Category ID is required', { itemIndex: i });
        const slotPostId = ((this.getNodeParameter('slotPostId', i, '') as string) || '').trim();
        // A category with no free slot answers 200 with next_slot: null.
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories/${categoryId}/slots/next`;
        if (slotPostId) options.qs = { post_id: slotPostId };
      }

      if (resource === 'approvalWorkflow' && operation === 'get') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const workflowId = ((this.getNodeParameter('workflowId', i) as string) || '').trim();
        if (!workflowId) throw new NodeOperationError(this.getNode(), 'Workflow ID is required', { itemIndex: i });
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows/${workflowId}`;
      }

      if (resource === 'approvalWorkflow' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const name = ((this.getNodeParameter('workflowName', i) as string) || '').trim();
        if (!name) throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex: i });
        const levels = parseJsonArray(this.getNode(), this.getNodeParameter('workflowLevels', i) as unknown, 'Levels');
        if (levels.length === 0) throw new NodeOperationError(this.getNode(), 'Levels must contain at least one approval level', { itemIndex: i });
        const isDraft = this.getNodeParameter('workflowIsDraft', i, false) as boolean;
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows`;
        options.body = { name, levels, is_draft: isDraft };
      }

      if (resource === 'approvalWorkflow' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const workflowId = ((this.getNodeParameter('workflowId', i) as string) || '').trim();
        if (!workflowId) throw new NodeOperationError(this.getNode(), 'Workflow ID is required', { itemIndex: i });
        const fields = this.getNodeParameter('workflowUpdateFields', i, {}) as Record<string, any>;
        const body: Record<string, any> = {};
        if (typeof fields.name === 'string' && fields.name.trim()) body.name = fields.name.trim();
        if (fields.levels !== undefined && fields.levels !== null && fields.levels !== '') {
          const levels = parseJsonArray(this.getNode(), fields.levels, 'Levels');
          if (levels.length === 0) throw new NodeOperationError(this.getNode(), 'Levels must contain at least one approval level', { itemIndex: i });
          body.levels = levels;
        }
        if (typeof fields.is_draft === 'boolean') body.is_draft = fields.is_draft;
        // `confirmed` opts in to cancelling approvals already in flight; the API
        // then answers 202 with a cascade_job_id instead of the updated workflow.
        if (typeof fields.confirmed === 'boolean') body.confirmed = fields.confirmed;
        if (Object.keys(body).length === 0) throw new NodeOperationError(this.getNode(), 'Add at least one field to Update Fields', { itemIndex: i });
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows/${workflowId}`;
        options.body = body;
      }

      if (resource === 'approvalWorkflow' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const workflowId = ((this.getNodeParameter('workflowId', i) as string) || '').trim();
        if (!workflowId) throw new NodeOperationError(this.getNode(), 'Workflow ID is required', { itemIndex: i });
        const force = this.getNodeParameter('workflowForceDelete', i, false) as boolean;
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows/${workflowId}`;
        // Without force a workflow with posts in review answers REQUIRES_FORCE_DELETE.
        if (force) options.qs = { force: 'true' };
      }

      if (resource === 'approvalWorkflow' && operation === 'duplicate') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const workflowId = ((this.getNodeParameter('workflowId', i) as string) || '').trim();
        if (!workflowId) throw new NodeOperationError(this.getNode(), 'Workflow ID is required', { itemIndex: i });
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows/${workflowId}/duplicate`;
      }

      if (resource === 'approvalWorkflow' && operation === 'setDefault') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const workflowId = ((this.getNodeParameter('workflowId', i) as string) || '').trim();
        if (!workflowId) throw new NodeOperationError(this.getNode(), 'Workflow ID is required', { itemIndex: i });
        // A draft cannot be the default: CANNOT_SET_DRAFT_AS_DEFAULT.
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows/${workflowId}/set-default`;
      }

      if (resource === 'approvalWorkflow' && operation === 'removeDefault') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const workflowId = ((this.getNodeParameter('workflowId', i) as string) || '').trim();
        if (!workflowId) throw new NodeOperationError(this.getNode(), 'Workflow ID is required', { itemIndex: i });
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows/${workflowId}/remove-default`;
      }

      if (resource === 'approvalWorkflow' && operation === 'getCascadeJob') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const cascadeJobId = ((this.getNodeParameter('cascadeJobId', i) as string) || '').trim();
        if (!cascadeJobId) throw new NodeOperationError(this.getNode(), 'Cascade Job ID is required', { itemIndex: i });
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows/cascade-jobs/${cascadeJobId}`;
      }

      if (resource === 'shareLink' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const search = ((this.getNodeParameter('shareLinkSearch', i, '') as string) || '').trim();
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/share-links`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (search) qs.search = search;
        options.qs = qs;
      }

      if (resource === 'shareLink' && operation === 'get') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const shareLinkId = ((this.getNodeParameter('shareLinkId', i) as string) || '').trim();
        if (!shareLinkId) throw new NodeOperationError(this.getNode(), 'Share Link ID is required', { itemIndex: i });
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/share-links/${shareLinkId}`;
      }

      if (resource === 'shareLink' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const name = ((this.getNodeParameter('shareLinkName', i) as string) || '').trim();
        if (!name) throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex: i });
        const scope = (this.getNodeParameter('shareLinkScope', i, 'selection') as string) || 'selection';
        const view = (this.getNodeParameter('shareLinkView', i, 'list') as string) || 'list';
        const plans = parseCommaSeparated(this.getNodeParameter('shareLinkPlans', i, '') as unknown);
        const notes = parseCommaSeparated(this.getNodeParameter('shareLinkNotes', i, '') as unknown);
        const isPasswordProtected = this.getNodeParameter('shareLinkIsPasswordProtected', i, false) as boolean;
        const password = ((this.getNodeParameter('shareLinkPassword', i, '') as string) || '').trim();
        const isSinglePost = this.getNodeParameter('shareLinkIsSinglePost', i, false) as boolean;
        const allowExternalApprovalActions = this.getNodeParameter('shareLinkAllowExternalApprovalActions', i, false) as boolean;
        const socialSelections = parseJsonObject(this.getNode(), this.getNodeParameter('shareLinkSocialSelections', i, '{}') as unknown, 'Social Selections');
        // future/all are calendar-only windows: they need an anchor date, cannot
        // collect external approvals, and still require plans or notes.
        const isWindowScope = scope === 'future' || scope === 'all';
        const calendarDate = ((this.getNodeParameter('shareLinkCalendarDate', i, '') as string) || '').trim();

        if (plans.length === 0 && notes.length === 0) {
          throw new NodeOperationError(this.getNode(), 'Either Plans or Notes is required', { itemIndex: i });
        }
        if (isWindowScope && view !== 'calendar') {
          throw new NodeOperationError(this.getNode(), 'Scope "future" and "all" are only available on the Calendar view', { itemIndex: i });
        }
        if (isWindowScope && !calendarDate) {
          throw new NodeOperationError(this.getNode(), 'Calendar Date is required when Scope is Future or All', { itemIndex: i });
        }
        if (isWindowScope && allowExternalApprovalActions) {
          throw new NodeOperationError(this.getNode(), 'External approval actions cannot be enabled when Scope is Future or All', { itemIndex: i });
        }
        if (isPasswordProtected && !password) {
          throw new NodeOperationError(this.getNode(), 'Password is required when Password Protected is enabled', { itemIndex: i });
        }
        if (isSinglePost && isWindowScope) {
          throw new NodeOperationError(this.getNode(), 'Single Post links require Scope "selection"', { itemIndex: i });
        }
        if (isSinglePost && plans.length !== 1) {
          throw new NodeOperationError(this.getNode(), 'Single Post links require exactly one plan', { itemIndex: i });
        }

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/share-links`;
        options.body = {
          name,
          scope,
          view,
          // Sent only for future/all; the API refuses an anchor on a selection link.
          ...(isWindowScope ? { calendar_date: calendarDate } : {}),
          ...(plans.length ? { plans } : {}),
          ...(notes.length ? { notes } : {}),
          show_notes: this.getNodeParameter('shareLinkShowNotes', i, false) as boolean,
          is_password_protected: isPasswordProtected,
          ...(isPasswordProtected ? { password } : {}),
          is_single_post: isSinglePost,
          allow_external_comments: this.getNodeParameter('shareLinkAllowExternalComments', i, false) as boolean,
          allow_external_approval_actions: allowExternalApprovalActions,
          ...(Object.keys(socialSelections).length ? { social_selections: socialSelections } : {}),
        };
      }

      if (resource === 'shareLink' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const shareLinkId = ((this.getNodeParameter('shareLinkId', i) as string) || '').trim();
        if (!shareLinkId) throw new NodeOperationError(this.getNode(), 'Share Link ID is required', { itemIndex: i });
        const fields = this.getNodeParameter('shareLinkUpdateFields', i, {}) as Record<string, any>;
        const body: Record<string, any> = {};

        for (const key of ['name', 'scope', 'view', 'calendar_date', 'approval_option'] as const) {
          const value = fields[key];
          if (typeof value === 'string' && value.trim()) body[key] = value.trim();
        }
        for (const key of [
          'show_notes',
          'is_disabled',
          'is_password_protected',
          'allow_external_comments',
          'allow_external_approval_actions',
          'approval_flow',
        ] as const) {
          if (typeof fields[key] === 'boolean') body[key] = fields[key];
        }
        if (typeof fields.password === 'string' && fields.password) body.password = fields.password;
        if (fields.notes !== undefined && fields.notes !== null && fields.notes !== '') {
          body.notes = parseCommaSeparated(fields.notes);
        }
        if (fields.approval_emails !== undefined && fields.approval_emails !== null && fields.approval_emails !== '') {
          const approvalEmails = parseCommaSeparated(fields.approval_emails);
          if (approvalEmails.length < 1 || approvalEmails.length > 10) {
            throw new NodeOperationError(this.getNode(), `Approval Emails takes between 1 and 10 addresses (got ${approvalEmails.length})`, { itemIndex: i });
          }
          body.approval_emails = approvalEmails;
        }
        if (fields.social_selections !== undefined && fields.social_selections !== null && fields.social_selections !== '') {
          const socialSelections = parseJsonObject(this.getNode(), fields.social_selections, 'Social Selections');
          if (Object.keys(socialSelections).length) body.social_selections = socialSelections;
        }
        if (body.is_password_protected === true && !body.password) {
          throw new NodeOperationError(this.getNode(), 'Password is required when Password Protected is enabled', { itemIndex: i });
        }
        if (Object.keys(body).length === 0) throw new NodeOperationError(this.getNode(), 'Add at least one field to Update Fields', { itemIndex: i });

        // `plans` and `filters` are create-only on the API and are not sent here.
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/share-links/${shareLinkId}`;
        options.body = body;
      }

      if (resource === 'shareLink' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const shareLinkId = ((this.getNodeParameter('shareLinkId', i) as string) || '').trim();
        if (!shareLinkId) throw new NodeOperationError(this.getNode(), 'Share Link ID is required', { itemIndex: i });
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/share-links/${shareLinkId}`;
      }

      if (resource === 'shareLink' && operation === 'sendInvitations') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const shareLinkId = ((this.getNodeParameter('shareLinkId', i) as string) || '').trim();
        if (!shareLinkId) throw new NodeOperationError(this.getNode(), 'Share Link ID is required', { itemIndex: i });
        const approvalEmails = parseCommaSeparated(this.getNodeParameter('shareLinkApprovalEmails', i, '') as unknown);
        if (approvalEmails.length < 1 || approvalEmails.length > 10) {
          throw new NodeOperationError(this.getNode(), `Approval Emails takes between 1 and 10 addresses (got ${approvalEmails.length})`, { itemIndex: i });
        }
        if (new Set(approvalEmails.map((email) => email.toLowerCase())).size !== approvalEmails.length) {
          throw new NodeOperationError(this.getNode(), 'Approval Emails must not repeat an address', { itemIndex: i });
        }
        const approvalOption = (this.getNodeParameter('shareLinkApprovalOption', i, 'anyone') as string) || 'anyone';
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/share-links/${shareLinkId}/send-invitations`;
        options.body = { approval_emails: approvalEmails, approval_option: approvalOption };
      }

      if (resource === 'shareLink' && operation === 'activity') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const shareLinkId = ((this.getNodeParameter('shareLinkId', i) as string) || '').trim();
        if (!shareLinkId) throw new NodeOperationError(this.getNode(), 'Share Link ID is required', { itemIndex: i });
        const activityType = ((this.getNodeParameter('shareLinkActivityType', i, '') as string) || '').trim();
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/share-links/${shareLinkId}/activity`;
        if (activityType) options.qs = { type: activityType };
      }

      if (resource === 'webhook') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const webhooksBase = `${baseRoot}/v1/workspaces/${workspaceId}/webhooks`;
        const needsId = ['get', 'update', 'delete', 'rotateSecret', 'getDeliveries'].includes(operation);
        const webhookId = needsId ? ((this.getNodeParameter('webhookId', i) as string) || '').trim() : '';
        if (needsId && !webhookId) throw new NodeOperationError(this.getNode(), 'Webhook ID is required', { itemIndex: i });

        if (operation === 'getEventTypes') {
          options.method = 'GET';
          options.url = `${webhooksBase}/event-types`;
        }

        if (operation === 'list') {
          options.method = 'GET';
          options.url = webhooksBase;
        }

        if (operation === 'get') {
          options.method = 'GET';
          options.url = `${webhooksBase}/${webhookId}`;
        }

        if (operation === 'create') {
          const url = ((this.getNodeParameter('webhookUrl', i) as string) || '').trim();
          if (!url) throw new NodeOperationError(this.getNode(), 'URL is required', { itemIndex: i });
          const eventTypes = (this.getNodeParameter('webhookEventTypes', i, []) as string[]) || [];
          if (eventTypes.length === 0) throw new NodeOperationError(this.getNode(), 'Select at least one Event Type', { itemIndex: i });
          const name = ((this.getNodeParameter('webhookName', i, '') as string) || '').trim();
          const secret = ((this.getNodeParameter('webhookSecret', i, '') as string) || '').trim();
          if (secret && !secret.startsWith('whsec_')) {
            throw new NodeOperationError(this.getNode(), 'Secret must start with whsec_', { itemIndex: i });
          }
          const customHeaders = parseJsonObject(this.getNode(), this.getNodeParameter('webhookCustomHeaders', i, '{}') as unknown, 'Custom Headers');
          options.method = 'POST';
          options.url = webhooksBase;
          options.body = {
            url,
            event_types: eventTypes,
            ...(name ? { name } : {}),
            ...(secret ? { secret } : {}),
            ...(Object.keys(customHeaders).length ? { custom_headers: customHeaders } : {}),
          };
        }

        if (operation === 'update') {
          const fields = this.getNodeParameter('webhookUpdateFields', i, {}) as Record<string, any>;
          const body: Record<string, any> = {};
          for (const key of ['url', 'name', 'status'] as const) {
            const value = fields[key];
            if (typeof value === 'string' && value.trim()) body[key] = value.trim();
          }
          if (Array.isArray(fields.event_types) && fields.event_types.length) body.event_types = fields.event_types;
          if (fields.custom_headers !== undefined && fields.custom_headers !== null && fields.custom_headers !== '') {
            body.custom_headers = parseJsonObject(this.getNode(), fields.custom_headers, 'Custom Headers');
          }
          if (Object.keys(body).length === 0) throw new NodeOperationError(this.getNode(), 'Add at least one field to Update Fields', { itemIndex: i });
          options.method = 'PUT';
          options.url = `${webhooksBase}/${webhookId}`;
          options.body = body;
        }

        if (operation === 'delete') {
          options.method = 'DELETE';
          options.url = `${webhooksBase}/${webhookId}`;
        }

        if (operation === 'rotateSecret') {
          options.method = 'POST';
          options.url = `${webhooksBase}/${webhookId}/rotate-secret`;
        }

        if (operation === 'getDeliveries') {
          const filters = this.getNodeParameter('webhookDeliveriesFilters', i, {}) as Record<string, any>;
          const qs: Record<string, any> = {
            page: this.getNodeParameter('webhookDeliveriesPage', i, 1) as number,
            per_page: this.getNodeParameter('webhookDeliveriesPerPage', i, 25) as number,
          };
          for (const key of ['status', 'event_type', 'from', 'to', 'search'] as const) {
            const value = filters[key];
            if (typeof value === 'string' && value.trim()) qs[key] = value.trim();
          }
          options.method = 'GET';
          options.url = `${webhooksBase}/${webhookId}/deliveries`;
          options.qs = qs;
        }
      }

      if (resource === 'brand') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const brandBase = `${baseRoot}/v1/workspaces/${workspaceId}/brand`;

        // Create and Add Sources share one body: website_url, text, files[], social_accounts[]
        const buildBrandSources = (): Record<string, any> => {
          const sources: Record<string, any> = {};
          const websiteUrl = ((this.getNodeParameter('brandWebsiteUrl', i, '') as string) || '').trim();
          if (websiteUrl) sources.website_url = websiteUrl;
          const text = ((this.getNodeParameter('brandText', i, '') as string) || '').trim();
          if (text) sources.text = text;
          const filesParam = this.getNodeParameter('brandFiles', i, {}) as Record<string, any>;
          const files = (Array.isArray(filesParam?.file) ? filesParam.file : [])
            .map((f: any) => {
              const url = String(f?.url ?? '').trim();
              if (!url) return null;
              const name = String(f?.name ?? '').trim();
              return name ? { url, name } : { url };
            })
            .filter(Boolean);
          if (files.length) sources.files = files;
          const socialAccounts = parseCommaSeparated(this.getNodeParameter('brandSocialAccounts', i, []));
          if (socialAccounts.length) sources.social_accounts = socialAccounts;
          if (Object.keys(sources).length === 0) {
            throw new NodeOperationError(this.getNode(), 'Provide at least one source: Website URL, Text, Files or Social Accounts', { itemIndex: i });
          }
          return sources;
        };

        if (operation === 'get') {
          options.method = 'GET';
          options.url = brandBase;
        }

        if (operation === 'getSection') {
          const section = this.getNodeParameter('brandSection', i) as string;
          options.method = 'GET';
          options.url = `${brandBase}/${section}`;
        }

        if (operation === 'create') {
          options.method = 'POST';
          options.url = brandBase;
          options.body = buildBrandSources();
          options.timeout = 180000;
        }

        if (operation === 'update') {
          const textOrNull = (value: unknown) => (typeof value === 'string' ? value.trim() : value);
          const body: Record<string, any> = {};

          const style = this.getNodeParameter('brandStyle', i, {}) as Record<string, any>;
          const brandStyle: Record<string, any> = {};
          for (const key of ['logo', 'title_font', 'body_font', 'visual_identity_description'] as const) {
            if (key in style) brandStyle[key] = textOrNull(style[key]);
          }
          if ('colors' in style) {
            const colors = Array.isArray(style.colors?.color) ? style.colors.color : [];
            brandStyle.colors = colors
              .map((c: any) => ({ hex: String(c?.hex ?? '').trim(), role: c?.role }))
              .filter((c: any) => c.hex);
          }
          if (Object.keys(brandStyle).length) body.brand_style = brandStyle;

          const collectSection = (
            param: string,
            textKeys: readonly string[],
            listKeys: readonly string[],
          ): Record<string, any> => {
            const values = this.getNodeParameter(param, i, {}) as Record<string, any>;
            const section: Record<string, any> = {};
            for (const key of textKeys) {
              if (key in values) section[key] = textOrNull(values[key]);
            }
            for (const key of listKeys) {
              if (key in values) section[key] = parseCommaSeparated(values[key]);
            }
            return section;
          };

          const brandProfile = collectSection(
            'brandProfile',
            ['business_name', 'core_identity', 'market_positioning'],
            ['competitors', 'competitive_advantages', 'primary_customer_segments', 'primary_value_drivers'],
          );
          if (Object.keys(brandProfile).length) body.brand_profile = brandProfile;

          const brandVoice = collectSection(
            'brandVoice',
            ['purpose', 'audience', 'voice_description'],
            ['tone', 'emotion', 'character', 'language'],
          );
          if (Object.keys(brandVoice).length) body.brand_voice = brandVoice;

          const enabled = this.getNodeParameter('brandEnabled', i, 'unchanged') as string;
          if (enabled === 'true' || enabled === 'false') body.brand_enabled = enabled === 'true';

          if (Object.keys(body).length === 0) {
            throw new NodeOperationError(this.getNode(), 'Add at least one Brand Style, Brand Profile or Brand Voice field, or set Brand Enabled', { itemIndex: i });
          }
          options.method = 'PATCH';
          options.url = brandBase;
          options.body = body;
        }

        if (operation === 'delete') {
          options.method = 'DELETE';
          options.url = brandBase;
        }

        if (operation === 'addSources') {
          const sources = buildBrandSources();
          const sourceCount = (sources.website_url ? 1 : 0)
            + (sources.text ? 1 : 0)
            + (Array.isArray(sources.files) ? sources.files.length : 0)
            + (sources.social_accounts ? 1 : 0);
          options.method = 'POST';
          options.url = `${brandBase}/sources`;
          options.body = sources;
          // Each source is analysed in turn and can take up to ~2 minutes
          options.timeout = Math.max(180000, sourceCount * 120000 + 60000);
        }

        if (operation === 'deleteSource') {
          const sourceId = ((this.getNodeParameter('brandSourceId', i) as string) || '').trim();
          if (!sourceId) throw new NodeOperationError(this.getNode(), 'Source ID is required', { itemIndex: i });
          options.method = 'DELETE';
          options.url = `${brandBase}/sources/${encodeURIComponent(sourceId)}`;
        }

        if (operation === 'sync') {
          options.method = 'POST';
          options.url = `${brandBase}/sync`;
          options.body = {};
          options.timeout = 180000;
        }

        if (operation === 'getPostSettings') {
          options.method = 'GET';
          options.url = `${brandBase}/post-generation-settings`;
        }

        if (operation === 'updatePostSettings') {
          const settings = this.getNodeParameter('brandPostSettings', i, {}) as Record<string, any>;
          const body: Record<string, any> = {};
          for (const key of ['social_platform', 'language', 'post_type', 'emoji_usage', 'hashtag_usage', 'aspect_ratio', 'image_style'] as const) {
            if (typeof settings[key] === 'string' && settings[key]) body[key] = settings[key];
          }
          for (const key of ['no_of_posts', 'caption_length'] as const) {
            if (settings[key] !== undefined && settings[key] !== null && settings[key] !== '') body[key] = Number(settings[key]);
          }
          if (Object.keys(body).length === 0) throw new NodeOperationError(this.getNode(), 'Add at least one setting', { itemIndex: i });
          options.method = 'PATCH';
          options.url = `${brandBase}/post-generation-settings`;
          options.body = body;
        }
      }

      if (resource === 'limit' && operation === 'get') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/limits`;
      }

      const response = await this.helpers.httpRequestWithAuthentication.call(
        this,
        CREDENTIALS_TYPE,
        options,
      );
      if (transformResponse) {
        for (const json of transformResponse(response)) {
          returnData.push({ json, pairedItem: { item: i } });
        }
      } else {
        returnData.push({ json: response, pairedItem: { item: i } });
      }
      } catch (error) {
        if (this.continueOnFail()) {
          const message = (error as any)?.message || String(error);
          returnData.push({ json: { error: message }, pairedItem: { item: i } });
          continue;
        }
        if (error instanceof NodeApiError || error instanceof NodeOperationError) {
          throw error;
        }
        throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
      }
    }

    return [returnData];
  }
}
