import { AppConfig } from "./AppConfig";

const CPU_UID = await AppConfig.findCpuId();

const buildURL = (path = '') => {
    if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
        return path;
    }

    const urlPrefix = import.meta.env.VITE_URL_PREFIX || '';
    const apiUrl = import.meta.env.VITE_API_URL || '';

    return `${urlPrefix}${apiUrl}${path}`;
};

const withTimeout = async (promise: Promise<any>, timeoutMs = 10000, label = 'API request') => {
    let timer = null;

    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const request = async ({
    method = 'GET',
    path = '',
    body = {},
    timeout = 10000,
}: {
    method?: string;
    path?: string;
    body?: Record<string, unknown> | null;
    timeout?: number;
} = {}) => {
    const url = buildURL(path);
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: null as string | null,
    };

    if (body !== null) {
        options.body = JSON.stringify({ ...body, device_uid: CPU_UID });
    } else {
        // If the body is null, still include the CPU_UID in the request body for backend just in case
        options.body = JSON.stringify({ device_uid: CPU_UID });
    }

    const response = await withTimeout(
        fetch(url, options),
        timeout,
        `${method} ${url}`
    );

    const responseText = response
        ? typeof response.text === 'function'
            ? await response.text()
            : typeof response.json === 'function'
                ? JSON.stringify(await response.json())
                : 'No response text'
        : 'No response text';

    if (!response.ok) {
        throw new Error(`${method} failed: ${response.status} - ${responseText}`);
    }

    try {
        return JSON.parse(responseText);
    } catch (error) {
        throw new Error(`Failed to parse JSON response from ${url}: ${responseText}`);
    }
};


export const API = {
    get(path = '', options = { timeout: 10000 }) {
        return request({
            method: 'GET',
            path,
            body: null,
            timeout: options.timeout,
        });
    },

    getAbsolute(url = '', options = { timeout: 10000 }) {
        return request({
            method: 'GET',
            path: url,
            body: null,
            timeout: options.timeout,
        });
    },

    post(path = '', body = {}, options = { timeout: 10000 }) {
        return request({
            method: 'POST',
            path,
            body: body,
            timeout: options.timeout,
        });
    },

    actionPost(action = '', body = {}, options = { timeout: 10000 }) {
        return this.post(`?action=${action}`, body, options);
    },

    postAbsolute(url = '', body = {}, options = { timeout: 10000 }) {
        return request({
            method: 'POST',
            path: url,
            body: body,
            timeout: options.timeout,
        });
    },
};