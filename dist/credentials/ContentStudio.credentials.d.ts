import type { ICredentialDataDecryptedObject, ICredentialTestRequest, ICredentialType, IHttpRequestOptions, INodeProperties } from 'n8n-workflow';
export declare const BASE_URL = "https://api-prod.contentstudio.io/api";
export declare class ContentStudio implements ICredentialType {
    name: string;
    displayName: string;
    documentationUrl: string;
    properties: INodeProperties[];
    test: ICredentialTestRequest;
    authenticate(credentials: ICredentialDataDecryptedObject, requestOptions: IHttpRequestOptions): Promise<IHttpRequestOptions>;
}
