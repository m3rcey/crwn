import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY || 'dummy-resend-key-for-build');

export const FROM_EMAIL = 'CRWN <hello@thecrwn.app>';
