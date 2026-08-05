import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { getWorkspaces, getPosts, getAccounts, getFirstCommentAccounts, getCarouselAccounts, getContentCategories, getTeamMembers, getFacebookBackgrounds, getApprovalWorkflows } from './loadOptions';
export declare class ContentStudio implements INodeType {
    description: INodeTypeDescription;
    methods: {
        loadOptions: {
            getWorkspaces: typeof getWorkspaces;
            getPosts: typeof getPosts;
            getAccounts: typeof getAccounts;
            getFirstCommentAccounts: typeof getFirstCommentAccounts;
            getCarouselAccounts: typeof getCarouselAccounts;
            getContentCategories: typeof getContentCategories;
            getTeamMembers: typeof getTeamMembers;
            getFacebookBackgrounds: typeof getFacebookBackgrounds;
            getApprovalWorkflows: typeof getApprovalWorkflows;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
