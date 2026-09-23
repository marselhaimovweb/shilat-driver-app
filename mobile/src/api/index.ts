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
 * not set                                  -> built-in demo data
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export const api = apiUrl ? createHttpApi(apiUrl, getToken) : createMockApi(getToken);
