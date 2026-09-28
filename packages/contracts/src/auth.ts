/** One photo payload limit shared by renderer, API and desktop protocol. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_DATA_URL_CHARS = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 64;
export const PHOTO_REQUEST_BODY_BYTES = MAX_PHOTO_DATA_URL_CHARS + 16 * 1024;
