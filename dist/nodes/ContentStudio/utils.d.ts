export declare function normalizeBase(u: string): string;
export declare function parseArray(val: unknown): any[];
export declare function parseAccounts(val: unknown): any[];
export declare function parseJsonObject(val: unknown): Record<string, any>;
export declare function parseMaybeObject(val: string): any;
export declare function parseCommaSeparated(val: unknown): string[];
export declare const SCHEDULING_PLATFORMS: string[];
export type SchedulingEntityRef = {
    id: string;
    type?: string;
};
export declare function parseSchedulingEntityRefs(val: unknown): SchedulingEntityRef[];
type OptimalTimeSlot = Record<string, any>;
export declare function flattenOptimalTimes(response: any, includeIndividual: boolean): OptimalTimeSlot[];
export declare function parseMediaImages(val: unknown): string[];
export declare function parseMediaVideo(val: unknown): string | undefined;
export {};
