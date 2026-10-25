import { useMemo, useState } from 'react'
import { buildImportPrompt } from '../lib/aiPrompt'
import { useI18n } from '../lib/i18n'

/** Gives the player a ready-made prompt that turns any sheet (scan, photo, odd PDF) into an import-ready fillable PDF. */
export default function AiHelper({ onClose, characterName }: { onClose?(): void; characterName?: string }) {
  const { t, lang } = useI18n()
  const prompt = useMemo(() => buildImportPrompt({ lang, characterName }), [lang, characterName])
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      const ta = document.querySelector<HTMLTextAreaElement>('.ai-prompt')
      ta?.select()
      document.execCommand('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([prompt], { type: 'text/markdown;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'character-import-prompt.md' })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="ai-helper card">
      <header className="ai-head">
        <span className="ai-badge" aria-hidden="true">🤖</span>
        <div className="grow">
          <h2>{t('aiTitle')}</h2>
          <p className="muted small">{t('aiIntro')}</p>
        </div>
        {onClose && <button className="roll-x" onClick={onClose} aria-label={t('close')}>✕</button>}
      </header>

      <ol className="ai-steps">
        <li>
          <strong>{t('aiStep1')}</strong>
          <div className="row wrap">
            <button className="btn btn-primary" onClick={copy}>{copied ? `✓ ${t('copied')}` : `📋 ${t('aiCopy')}`}</button>
            <button className="btn btn-small btn-ghost" onClick={download}>⬇ {t('aiDownload')}</button>
          </div>
        </li>
        <li><strong>{t('aiStep2')}</strong><span className="muted small">{t('aiStep2Hint')}</span></li>
        <li><strong>{t('aiStep3')}</strong><span className="muted small">{t('aiStep3Hint')}</span></li>
        <li><strong>{t('aiStep4')}</strong></li>
      </ol>

      <details className="ai-preview">
        <summary>{t('aiShowPrompt')}</summary>
        <textarea className="ai-prompt" dir="ltr" readOnly value={prompt} rows={16} />
      </details>
      <p className="muted small ai-privacy">🔒 {t('aiPrivacy')}</p>
    </section>
  )
}
