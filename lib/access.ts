import admin from './platform-admin.json';
export const ADMIN_EMAIL = admin.email;
// UI gating mirrors Firebase rules; authorization is enforced by the signed Google token.
export const isPlatformAdmin = (user: {email: string | null; emailVerified: boolean} | null) =>
  !!user?.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL;
