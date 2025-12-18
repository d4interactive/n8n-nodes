"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStudio = exports.BASE_URL = void 0;
const DISPLAY_NAME = 'ContentStudio API';
exports.BASE_URL = 'https://api-prod.contentstudio.io/api';
class ContentStudio {
    constructor() {
        this.name = 'contentStudio';
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
        this.test = {
            request: {
                baseURL: exports.BASE_URL,
                url: '/v1/me',
            },
        };
    }
    async authenticate(credentials, requestOptions) {
        var _a;
        (_a = requestOptions.headers) !== null && _a !== void 0 ? _a : (requestOptions.headers = {});
        requestOptions.headers['X-API-Key'] = credentials.apiKey;
        return requestOptions;
    }
}
exports.ContentStudio = ContentStudio;
