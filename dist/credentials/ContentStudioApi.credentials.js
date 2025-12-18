"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStudioApi = exports.BASE_URL = void 0;
const DISPLAY_NAME = 'ContentStudio API';
exports.BASE_URL = 'https://api-prod.contentstudio.io/api';
class ContentStudioApi {
    constructor() {
        this.name = 'contentStudioApi';
        this.displayName = DISPLAY_NAME;
        this.documentationUrl = 'https://api.contentstudio.io/guide';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                description: 'Your ContentStudio X-API-Key',
            },
        ];
    }
}
exports.ContentStudioApi = ContentStudioApi;
