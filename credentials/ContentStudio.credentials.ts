import type {
    ICredentialDataDecryptedObject,
    ICredentialTestRequest,
    ICredentialType,
    IHttpRequestOptions,
    INodeProperties,
} from 'n8n-workflow';

const DISPLAY_NAME = 'ContentStudio API';
export const BASE_URL = 'https://api-prod.contentstudio.io/api';

export class ContentStudio implements ICredentialType {
  name = 'contentStudio';
  displayName = DISPLAY_NAME;
  documentationUrl = 'https://api.contentstudio.io/guide';

  properties: INodeProperties[] = [
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

    test: ICredentialTestRequest = {
        request: {
            baseURL: BASE_URL,
            url: '/v1/me',
        },
    };

    async authenticate(
        credentials: ICredentialDataDecryptedObject,
        requestOptions: IHttpRequestOptions,
    ): Promise<IHttpRequestOptions> {
        requestOptions.headers ??= {};
        requestOptions.headers['X-API-Key'] = credentials.apiKey as string;

        return requestOptions;
    }
}
