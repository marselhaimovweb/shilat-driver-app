import { createHttpApi } from './http';
import { createMockApi } from './mock';

export * from './types';

let currentToken: string | null = null;
export const setApiToken = (token: string | null) => {
  currentToken = token;
};
const getToken = () => currentToken;

/**
 * EXPO_PUBLIC_API_URL=http://<server>:4000 -> live server (SQL Server)
 * EXPO_PUBLIC_API_URL=same-origin            -> web build served by the API server itself
 * not set                                  -> built-in demo data
 */
const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
const apiUrl = configuredUrl === 'same-origin' ? (typeof window !== 'undefined' ? window.location.origin : '') : configuredUrl;

export const api = apiUrl ? createHttpApi(apiUrl, getToken) : createMockApi(getToken);
