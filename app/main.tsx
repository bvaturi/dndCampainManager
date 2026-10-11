import React from 'react';
import {createRoot} from 'react-dom/client';
import {LanguageProvider} from './language';
import CampaignApp from './campaign-app';
import './globals.css';
import './campaign.css';
import {createGateway} from '@/lib/backend';
createRoot(document.getElementById('root')!).render(<React.StrictMode><LanguageProvider>{import.meta.env.DEV&&import.meta.env.VITE_PREVIEW==='true'&&<div className="preview-banner">Local preview · Fictional data · Firebase is not connected. <a href="/?previewUser=dm">DM view</a> · <a href="/?previewUser=player">Player view</a> · <a href="/?previewUser=other">Second player</a></div>}<CampaignApp gateway={createGateway()}/></LanguageProvider></React.StrictMode>);
