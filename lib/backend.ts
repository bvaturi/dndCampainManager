import { FirebaseGateway } from "./firebase-gateway";
import type { Gateway } from "./gateway";
import { PreviewGateway } from "./preview-gateway";
// Preview login is available only in development; production always uses Google Auth.
export function createGateway(): Gateway | null {
  if (import.meta.env.DEV && import.meta.env.VITE_PREVIEW === "true")
    return new PreviewGateway();
  return new FirebaseGateway();
}
