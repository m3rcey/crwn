// The import-time permission attestation for artist fan-contact imports.
//
// Importing a CSV does NOT create marketing consent: the fans consented (or did not) to the
// ARTIST, somewhere else, before CRWN ever saw the file. What CRWN can honestly record is the
// artist's explicit attestation that permission exists, versioned and timestamped, and then
// enforce unsubscribe + suppression on every send. The invite/campaign path refuses contacts
// imported without this attestation.
//
// Shared by FanImportModal (renders the exact text) and /api/fan-contacts/import (stores it).

export const IMPORT_ATTESTATION_VERSION = 'import-attestation-2026-07-30.v1';

export const IMPORT_ATTESTATION_TEXT =
  'These fans gave me permission to contact them: they joined my list, bought from me, or asked to hear from me. I understand every email CRWN sends them includes an unsubscribe link.';
