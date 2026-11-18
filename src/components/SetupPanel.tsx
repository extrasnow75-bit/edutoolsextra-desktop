/**
 * Initial setup: which Canvas, and the token. Open until a working token is saved, then folded
 * away with green chips, the pattern Extractor Tools uses. The token goes to the main process
 * once and is never shown again; only its last four characters come back.
 */
import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { SetupStatus, TokenCheck } from '../shared/api'
import { Button, Callout, Chip, TextField, cleanError } from './ui'

export function SetupPanel({ status, onChange }: { status: SetupStatus; onChange(): void }) {
  const [open, setOpen] = useState(!status.hasToken)
  const [site, setSite] = useState(status.site.replace(/^https:\/\//, ''))
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null)
  const [check, setCheck] = useState<TokenCheck | null>(null)

  useEffect(() => {
    if (!status.hasToken) setOpen(true)
  }, [status.hasToken])

  useEffect(() => {
    if (status.hasToken) window.api.setup.checkToken().then(setCheck).catch(() => setCheck('unknown'))
  }, [status.hasToken, status.hint])

  const saveSite = async () => {
    const res = await window.api.setup.saveSite(site)
    if (res.ok) {
      setSite(res.site.replace(/^https:\/\//, ''))
      setMessage({ tone: 'ok', text: `Canvas site saved: ${res.site}` })
      onChange()
    } else setMessage({ tone: 'bad', text: res.message })
  }

  const saveToken = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await window.api.setup.saveToken(token)
      if (!res.ok) return setMessage({ tone: 'bad', text: res.message })
      setToken('')
      setCheck(res.check)
      setMessage(
        res.check === 'valid'
          ? { tone: 'ok', text: "Token saved in this computer's keychain, and Canvas accepted it." }
          : res.check === 'expired'
            ? { tone: 'bad', text: 'Token saved, but Canvas did not accept it. It may be expired or mistyped.' }
            : { tone: 'warn', text: 'Token saved. Canvas could not be reached to check it; it will be tried when you next use a tool.' },
      )
      onChange()
      if (res.check === 'valid') setOpen(false)
    } catch (e) {
      setMessage({ tone: 'bad', text: cleanError(e) })
    } finally {
      setBusy(false)
    }
  }

  const tokenChip = !status.hasToken ? (
    <Chip tone="bad">No Canvas token</Chip>
  ) : check === 'expired' ? (
    <Chip tone="bad">Token expired</Chip>
  ) : check === 'valid' ? (
    <Chip tone="ok">✓ Canvas connected</Chip>
  ) : (
    <Chip tone="plain">Token saved</Chip>
  )

  return (
    <section className="bg-white border border-gray-200 rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-2xl"
      >
        <span className="font-bold text-[14px] flex items-center gap-1.5">
          {open ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
          Initial setup
        </span>
        <span className="flex flex-wrap gap-2">
          {tokenChip}
          <Chip tone="info">{status.site.replace(/^https:\/\//, '')}</Chip>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-4">
          {!status.encryptionAvailable && (
            <Callout tone="bad">This computer's keychain is not available, so the app cannot store a Canvas token safely.</Callout>
          )}
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <TextField id="setup-site" label="Canvas site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="boisestatecanvas.instructure.com" />
            <Button variant="ghost" onClick={saveSite}>Save site</Button>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <TextField
              id="setup-token"
              type="password"
              autoComplete="off"
              label={status.hasToken ? `Canvas token (saved, ending ••••${status.hint})` : 'Canvas token'}
              hint={status.hasToken ? 'Paste a new token here only to replace the saved one.' : undefined}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Canvas access token"
            />
            <Button onClick={saveToken} disabled={busy || !token.trim() || !status.encryptionAvailable}>{busy ? 'Checking…' : 'Save and check'}</Button>
          </div>
          {message && <Callout tone={message.tone}>{message.text}</Callout>}
          <details className="text-[13px] text-gray-700">
            <summary className="font-bold cursor-pointer text-brand">How to get a Canvas token</summary>
            <ol className="list-decimal pl-5 mt-2 grid gap-1">
              <li>In Canvas, choose <b>Account</b>, then <b>Settings</b>.</li>
              <li>Under Approved Integrations, choose <b>+ New Access Token</b>.</li>
              <li>Type a purpose such as “edutools” and give it an expiry date. Use a token just for this app.</li>
              <li>Choose <b>Generate Token</b>, copy it, and paste it above. Canvas shows it only once.</li>
            </ol>
            <p className="mt-2">The token is stored in this computer's keychain and only ever sent to the Canvas site above.</p>
          </details>
          {status.hasToken && (
            <div>
              <Button variant="link" onClick={async () => { await window.api.setup.removeToken(); setCheck(null); onChange() }}>
                Remove the saved token
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
