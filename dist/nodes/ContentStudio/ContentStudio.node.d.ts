import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { getWorkspaces, getPosts, getAccounts, getFirstCommentAccounts, getContentCategories, getTeamMembers, getFacebookBackgrounds } from './loadOptions';
export declare class ContentStudio implements INodeType {
    description: INodeTypeDescription;
    methods: {
        loadOptions: {
            getWorkspaces: typeof getWorkspaces;
            getPosts: typeof getPosts;
            getAccounts: typeof getAccounts;
            getFirstCommentAccounts: typeof getFirstCommentAccounts;
            getContentCategories: typeof getContentCategories;
            getTeamMembers: typeof getTeamMembers;
            getFacebookBackgrounds: typeof getFacebookBackgrounds;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
