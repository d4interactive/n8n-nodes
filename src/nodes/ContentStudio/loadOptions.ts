import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { normalizeBase } from './utils';
import { BASE_URL } from '../../credentials/ContentStudioApi.credentials';

function isContentStudioDebugEnabled(): boolean {
  const v = process.env.CONTENTSTUDIO_DEBUG;
  return v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
}

function redactApiKey(key: string): string {
  const k = String(key || '');
  if (!k) return '';
  if (k.length <= 8) return '***';
  return `${k.slice(0, 3)}***${k.slice(-5)}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractApiErrorMessage(body: unknown): string {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body === 'object') {
    const b: any = body;
    return b.message || b.error || b.errors || safeStringify(b);
  }
  return String(body);
}

function normalizeHttpResponse(res: any): { statusCode?: number; body: any } {
  // n8n helpers.httpRequest can return either the response body directly (common)
  // or a full response object (depending on implementation/options).
  if (res && typeof res === 'object' && 'body' in res && 'statusCode' in res) {
    return { statusCode: res.statusCode, body: res.body };
  }
  return { statusCode: res?.statusCode, body: res };
}

async function httpRequestNormalized(
  ctx: ILoadOptionsFunctions,
  options: any,
): Promise<{ statusCode?: number; body: any }> {
  return normalizeHttpResponse(await ctx.helpers.httpRequest(options));
}

function extractListFromBody(body: any): any[] {
  return Array.isArray(body) ? body : (body?.data || []);
}

function extractHttpErrorDetails(error: any): { statusCode: string | number; apiMessage: string } {
  const statusCode = error?.statusCode || error?.response?.statusCode || error?.response?.status || 'unknown';
  const body = error?.response?.body ?? error?.response?.data;
  const apiMessage = extractApiErrorMessage(body) || error?.message || String(error);
  return { statusCode, apiMessage };
}

function formatAccountOption(a: any): INodePropertyOptions | null {
  const id = a?._id;
  if (!id) return null;
  const platform = a?.platform || a?.provider || '';
  const accountName = a?.account_name || a?.username || a?.handle || a?.name || '';
  const label = [platform, accountName]
    .filter(Boolean)
    .join(' - ') || String(id);
  return { name: label, value: String(id) } as INodePropertyOptions;
}

function parseSelectedAccountIds(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((v) => String(v)).filter(Boolean);
  }
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      // ignore
    }
    return [t];
  }
  return [];
}

export async function getFirstCommentAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const credentials = await this.getCredentials('contentStudioApi');
    const baseRoot = normalizeBase(BASE_URL);
    const apiKey = credentials.apiKey as string;
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];

    const selectedRaw = this.getCurrentNodeParameter('accounts');
    const selectedIds = Array.from(new Set(parseSelectedAccountIds(selectedRaw)));
    if (selectedIds.length === 0) return [];
    const selectedSet = new Set(selectedIds);

    const baseQsAll = { page: 1, per_page: 100 };
    const baseQsSelected = { page: 1, per_page: Math.min(Math.max(selectedIds.length, 1), 100) };
    const idsCsv = selectedIds.join(',');
    const qsWithIds: any = {
      ...baseQsSelected,
      ids: idsCsv,
    };

    const optionsBase: any = {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
      json: true,
      headers: { accept: 'application/json', 'X-API-Key': apiKey },
      simple: false,
      resolveWithFullResponse: true,
      timeout: 60000,
    };

    if (isContentStudioDebugEnabled()) {
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getFirstCommentAccounts request',
        safeStringify({
          url: optionsBase.url,
          method: optionsBase.method,
          qs: qsWithIds,
          selectedIdsCount: selectedIds.length,
          apiKeyLength: String(apiKey || '').length,
          headers: { ...(optionsBase.headers || {}), 'X-API-Key': redactApiKey(apiKey) },
        }),
      );
    }

    let { statusCode, body } = await httpRequestNormalized(this, { ...optionsBase, qs: qsWithIds });
    if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
      if (isContentStudioDebugEnabled()) {
        console.log(
          '[ContentStudio][DEBUG] loadOptions.getFirstCommentAccounts retryWithoutIds',
          safeStringify({ statusCode }),
        );
      }
      ({ statusCode, body } = await httpRequestNormalized(this, { ...optionsBase, qs: baseQsAll }));
    }

    if (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300)) {
      const apiMessage = extractApiErrorMessage(body);
      throw new Error(`Failed to load First Comment Accounts: (${statusCode}) ${apiMessage || 'Request failed'}`);
    }

    const list: any[] = extractListFromBody(body);
    const out = list
      .filter((a: any) => {
        const id = a?._id;
        return id && selectedSet.has(String(id));
      })
      .map(formatAccountOption)
      .filter((o): o is INodePropertyOptions => !!o);

    if (isContentStudioDebugEnabled()) {
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getFirstCommentAccounts response',
        safeStringify({ ok: true, count: out.length, selectedIdsCount: selectedIds.length }),
      );
    }

    return out;
  } catch (error) {
    if (isContentStudioDebugEnabled()) {
      const e: any = error;
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getFirstCommentAccounts error',
        safeStringify({
          statusCode: e?.statusCode || e?.response?.statusCode || e?.response?.status || 'unknown',
          errorMessage: e?.message,
          responseBody: e?.response?.body ?? e?.response?.data,
        }),
      );
    }
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load First Comment Accounts: (${statusCode}) ${apiMessage}`);
  }
}

export async function getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const credentials = await this.getCredentials('contentStudioApi');
    const baseRoot = normalizeBase(BASE_URL);
    const apiKey = credentials.apiKey as string;
    const options: any = {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces`,
      qs: { page: 1, per_page: 100 },
      json: true,
      headers: { accept: 'application/json', 'X-API-Key': apiKey },
      simple: false,
      resolveWithFullResponse: true,
      timeout: 60000,
    };

    if (isContentStudioDebugEnabled()) {
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getWorkspaces request',
        safeStringify({
          url: options.url,
          method: options.method,
          qs: options.qs,
          apiKeyLength: String(apiKey || '').length,
          headers: { ...(options.headers || {}), 'X-API-Key': redactApiKey(apiKey) },
        }),
      );
    }

    const res: any = await this.helpers.httpRequest(options);
    const { statusCode, body } = normalizeHttpResponse(res);
    if (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300)) {
      const apiMessage = extractApiErrorMessage(body);
      throw new Error(`Failed to load Workspaces: (${statusCode}) ${apiMessage || 'Request failed'}`);
    }

    if (isContentStudioDebugEnabled()) {
      const count = Array.isArray(body?.data) ? body.data.length : undefined;
      console.log('[ContentStudio][DEBUG] loadOptions.getWorkspaces response', safeStringify({ ok: true, count }));
    }

    const list: any[] = body?.data || [];
    const out = list
      .map((w: any) => {
        const id = w?._id;
        if (!id) return null;
        const name = w?.name || w?.title || id;
        return { name, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
    return out;
  } catch (error) {
    if (isContentStudioDebugEnabled()) {
      const e: any = error;
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getWorkspaces error',
        safeStringify({
          statusCode: e?.statusCode || e?.response?.statusCode || e?.response?.status || 'unknown',
          errorMessage: e?.message,
          responseBody: e?.response?.body,
        }),
      );
    }
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load Workspaces: (${statusCode}) ${apiMessage}`);
  }
}

export async function getPosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const credentials = await this.getCredentials('contentStudioApi');
    const baseRoot = normalizeBase(BASE_URL);
    const apiKey = credentials.apiKey as string;
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const options: any = {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces/${workspaceId}/posts`,
      qs: { page: 1, per_page: 50 },
      json: true,
      headers: { accept: 'application/json', 'X-API-Key': apiKey },
      timeout: 60000,
    };

    if (isContentStudioDebugEnabled()) {
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getPosts request',
        safeStringify({
          url: options.url,
          method: options.method,
          qs: options.qs,
          apiKeyLength: String(apiKey || '').length,
          headers: { ...(options.headers || {}), 'X-API-Key': redactApiKey(apiKey) },
        }),
      );
    }

    const res: any = await this.helpers.httpRequest(options);

    if (isContentStudioDebugEnabled()) {
      const count = Array.isArray(res?.data) ? res.data.length : undefined;
      console.log('[ContentStudio][DEBUG] loadOptions.getPosts response', safeStringify({ ok: true, count }));
    }

    const list: any[] = res?.data || [];
    const out = list
      .map((p: any) => {
        const id = p?._id;
        if (!id) return null;
        const text: string = (p?.content?.text || p?.title || '') as string;
        const labelBase = `${(text || '').slice(0, 60)}${text && text.length > 60 ? '…' : ''}`.trim();
        const label = `${labelBase}${p?.status ? ` (${p.status})` : ''}` || String(id);
        return { name: label, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
    return out;
  } catch (error) {
    if (isContentStudioDebugEnabled()) {
      const e: any = error;
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getPosts error',
        safeStringify({
          statusCode: e?.statusCode || e?.response?.statusCode || e?.response?.status || 'unknown',
          errorMessage: e?.message,
          responseBody: e?.response?.body,
        }),
      );
    }
    const msg = (error as any)?.message || String(error);
    throw new Error(`Failed to load Posts: ${msg}`);
  }
}

export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  let workspaceId = '';
  try {
    const credentials = await this.getCredentials('contentStudioApi');
    const baseRoot = normalizeBase(BASE_URL);
    const apiKey = credentials.apiKey as string;
    workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const options: any = {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
      qs: { page: 1, per_page: 100 },
      json: true,
      headers: { accept: 'application/json', 'X-API-Key': apiKey },
      simple: false,
      resolveWithFullResponse: true,
      timeout: 60000,
    };

    if (isContentStudioDebugEnabled()) {
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getAccounts request',
        safeStringify({
          url: options.url,
          method: options.method,
          qs: options.qs,
          apiKeyLength: String(apiKey || '').length,
          headers: { ...(options.headers || {}), 'X-API-Key': redactApiKey(apiKey) },
        }),
      );
    }

    const res: any = await this.helpers.httpRequest(options);
    const normalized = normalizeHttpResponse(res);
    const statusCode = normalized.statusCode;
    const body = normalized.body;
    if (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300)) {
      const apiMessage = extractApiErrorMessage(body);
      const hint = statusCode === 403
        ? ' Forbidden: this API key user likely does not have access to Social Accounts in this workspace. Try a different workspaceId or adjust workspace/team permissions.'
        : '';
      throw new Error(`Failed to load Accounts for workspace ${workspaceId}: (${statusCode}) ${apiMessage || 'Request failed'}${hint}`);
    }

    if (isContentStudioDebugEnabled()) {
      const count = Array.isArray(body?.data) ? body.data.length : undefined;
      console.log('[ContentStudio][DEBUG] loadOptions.getAccounts response', safeStringify({ ok: true, count }));
    }

    const list: any[] = body?.data || [];
    const out = list
      .map(formatAccountOption)
      .filter((o): o is INodePropertyOptions => !!o);
    return out;
  } catch (error) {
    if (isContentStudioDebugEnabled()) {
      const e: any = error;
      console.log(
        '[ContentStudio][DEBUG] loadOptions.getAccounts error',
        safeStringify({
          statusCode: e?.statusCode || e?.response?.statusCode || e?.response?.status || 'unknown',
          errorMessage: e?.message,
          responseBody: e?.response?.body,
        }),
      );
    }
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    const hint = statusCode === 403
      ? ' Forbidden: this API key user likely does not have access to Social Accounts in this workspace. Try a different workspaceId or adjust workspace/team permissions.'
      : '';
    throw new Error(`Failed to load Accounts for workspace ${workspaceId}: (${statusCode}) ${apiMessage}${hint}`);
  }
}
