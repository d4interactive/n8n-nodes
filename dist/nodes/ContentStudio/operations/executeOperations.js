"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeOperations = executeOperations;
async function executeOperations(items) {
    var _a;
    const returnData = [];
    for (let i = 0; i < items.length; i++) {
        const resource = this.getNodeParameter('resource', i);
        const operation = this.getNodeParameter('operation', i);
        const credentials = await this.getCredentials('contentStudioApi');
        const normalizeBase = (u) => u.replace(/\/$/, '').replace(/\/v1$/, '');
        const baseRoot = normalizeBase(credentials.baseUrl);
        const apiKey = credentials.apiKey;
        const options = {
            method: 'GET',
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
        };
        if (resource === 'auth' && operation === 'validateKey') {
            options.uri = `${baseRoot}/v1/me`;
        }
        if (resource === 'workspace' && operation === 'list') {
            options.uri = `${baseRoot}/v1/workspaces`;
            options.qs = { page: 1, per_page: 100 };
        }
        if (resource === 'socialAccount' && operation === 'list') {
            const workspaceId = this.getNodeParameter('workspaceId', i);
            options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
            options.qs = { page: 1, per_page: 100 };
        }
        if (resource === 'post' && operation === 'list') {
            const workspaceId = this.getNodeParameter('workspaceId', i);
            const page = this.getNodeParameter('page', i, 1);
            const perPage = this.getNodeParameter('perPage', i, 10);
            const dateFrom = this.getNodeParameter('dateFrom', i, '');
            const dateTo = this.getNodeParameter('dateTo', i, '');
            options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
            options.qs = { page, per_page: perPage };
            if (dateFrom)
                options.qs.date_from = dateFrom;
            if (dateTo)
                options.qs.date_to = dateTo;
        }
        if (resource === 'post' && operation === 'create') {
            const workspaceId = this.getNodeParameter('workspaceId', i);
            const contentText = this.getNodeParameter('contentText', i, '');
            const mediaImages = this.getNodeParameter('mediaImages', i, {});
            const mediaVideo = this.getNodeParameter('mediaVideo', i, {});
            const accounts = this.getNodeParameter('accounts', i, []);
            const scheduledAt = this.getNodeParameter('scheduledAt', i);
            // Validation
            const hasText = contentText && contentText.trim();
            const hasImages = (mediaImages === null || mediaImages === void 0 ? void 0 : mediaImages.images) && Array.isArray(mediaImages.images) && mediaImages.images.length > 0;
            const hasVideo = (mediaVideo === null || mediaVideo === void 0 ? void 0 : mediaVideo.video) && Array.isArray(mediaVideo.video) && mediaVideo.video.length > 0 && ((_a = mediaVideo.video[0]) === null || _a === void 0 ? void 0 : _a.url);
            if (!hasText && !hasImages && !hasVideo) {
                throw new Error('At least one of the following must be provided: Content Text, Media Images, or Media Video');
            }
            // Validate scheduled date format
            const datePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
            if (!datePattern.test(scheduledAt)) {
                throw new Error('Scheduled At must be in format: YYYY-MM-DD HH:MM:SS (e.g., 2025-10-11 11:15:00)');
            }
            const body = {
                content: {},
                accounts: accounts || [],
                publish_type: 'scheduled',
                scheduled_at: scheduledAt,
            };
            if (hasText) {
                body.content.text = contentText;
            }
            if (hasImages) {
                body.content.media = body.content.media || {};
                body.content.media.images = mediaImages.images.map((img) => img.url).filter(Boolean);
            }
            if (hasVideo) {
                body.content.media = body.content.media || {};
                body.content.media.video = mediaVideo.video[0].url;
            }
            options.method = 'POST';
            options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
            options.body = body;
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
    return returnData;
}
