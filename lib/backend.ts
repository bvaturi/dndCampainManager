import type {Gateway} from './gateway';
import {PreviewGateway} from './preview-gateway';
// The preview is compiled out of production. Firebase will replace this null
// after the requested Google account and project are connected.
export function createGateway():Gateway|null {return import.meta.env.DEV&&import.meta.env.VITE_PREVIEW==='true'?new PreviewGateway():null;}
