import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
export declare const loadOptionsMethods: {
    getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
    getPosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
    getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
};
