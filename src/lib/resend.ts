import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY || 'dummy-resend-key-for-build');

export const FROM_EMAIL = 'CRWN <hello@thecrwn.app>';

/**
 * The founder's personal voice on the SAME authenticated domain: Josh's name, CRWN's mailbox.
 * Replies go to Josh directly (pair it with replyTo: ADMIN_NOTIFY_EMAIL). There is no
 * josh@thecrwn.app mailbox and no Gmail integration; this is the one founder identity CRWN has.
 */
export const FOUNDER_FROM = 'Josh at CRWN <hello@thecrwn.app>';
