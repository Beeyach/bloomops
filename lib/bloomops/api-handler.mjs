import { json } from './access.mjs';

export class InvalidBodyError extends Error {}

// Last boundary for protected HTTP handlers, including authorization/read
// failures. Database errors and their parameters never become response bodies.
export function withApiErrors(handler) {
  return async (...args) => {
    try {
      const response = await handler(...args);
      response.headers.set('cache-control', response.headers.get('cache-control')?.split(',').some(value => value.trim() === 'private') ? 'private, no-store' : 'no-store');
      return response;
    } catch (error) {
      return error instanceof InvalidBodyError
        ? json({ error: 'Enter a valid JSON object.' }, 400)
        : json({ error: 'The request could not be completed. Please try again.' }, 500);
    }
  };
}
