import { GoogleDriveConnection } from './GoogleDriveConnection'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, FileCheck2, LoaderCircle, LockKeyhole, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react'

import { login, logout, registerAccount, type AppUser } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useI18n } from '../i18n'

interface AccountAccessProps {
  onUserChange: (user: AppUser | null) => void
  showForm?: boolean
  user: AppUser | null
}

const REMEMBERED_USERNAME_KEY = 'shopping-recorder-remembered-username'
type PasswordCredentialConstructor = new (data: { id: string; name: string; password: string }) => Credential

function readRememberedUsername() {
  try { return localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? '' } catch { return '' }
}

function forgetRememberedUsername() {
  try { localStorage.removeItem(REMEMBERED_USERNAME_KEY) } catch { /* browser storage is optional */ }
}

function rememberBrowserLogin(username: string, password: string) {
  try { localStorage.setItem(REMEMBERED_USERNAME_KEY, username) } catch { /* browser storage is optional */ }
  const PasswordCredentialClass = (globalThis as typeof globalThis & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential
  if (!PasswordCredentialClass || typeof navigator === 'undefined' || !navigator.credentials?.store) return
  void navigator.credentials.store(new PasswordCredentialClass({ id: username, name: username, password })).catch(() => undefined)
}

export function AccountAccess({ onUserChange, showForm = true, user }: AccountAccessProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [rememberedUsername, setRememberedUsername] = useState(readRememberedUsername)
  const [rememberCredentials, setRememberCredentials] = useState(() => Boolean(readRememberedUsername()))
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    function dismissOutside(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    function dismissWithKeyboard(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setProfileOpen(false)
      profileRef.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissWithKeyboard)
    }
  }, [profileOpen])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const username = String(data.get('username') ?? '').trim()
    const password = String(data.get('password') ?? '')
    try {
      const current = mode === 'register'
        ? await registerAccount({ email: String(data.get('email') ?? '').trim() || null, password, username })
        : await login({ password, username })
      if (rememberCredentials) {
        rememberBrowserLogin(username, password)
        setRememberedUsername(username)
      } else {
        forgetRememberedUsername()
        setRememberedUsername('')
      }
      onUserChange(current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Authentication failed.'))
    } finally { setSubmitting(false) }
  }

  async function signOut() {
    setSubmitting(true)
    setError('')
    try {
      await logout()
      onUserChange(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to sign out.'))
    } finally { setSubmitting(false) }
  }

  if (user) {
    const profile = (
      <div className="relative" ref={profileRef}>
        <Button aria-expanded={profileOpen} aria-haspopup="dialog" aria-label={t('Open profile')} className="grid size-10 !min-h-0 place-items-center rounded-full bg-primary p-0 text-primary-foreground shadow-sm" type="button" onClick={() => setProfileOpen((open) => !open)}><UserRound aria-hidden="true" className="size-4" /></Button>
        {profileOpen && <div className="absolute right-0 top-12 z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border bg-card p-4 text-left shadow-xl" role="dialog" aria-label={t('Profile menu')}>
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><UserRound aria-hidden="true" className="size-4" /></span><div className="min-w-0"><span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Signed in as')}</span><p className="truncate font-semibold">{user.username}</p></div></div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" /> {t('Session protected')}</div>
          {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
          <GoogleDriveConnection onUnlinked={() => { setProfileOpen(false); window.location.reload() }} />
          <Button className="mt-4 w-full" disabled={submitting} variant="outline" onClick={() => void signOut()}><LogOut aria-hidden="true" className="size-4" /> {t('Sign out')}</Button>
        </div>}
      </div>
    )
    const target = typeof document !== 'undefined' ? document.getElementById('header-profile') : null
    if (target) return createPortal(profile, target)
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-card to-accent/40">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"><UserRound aria-hidden="true" className="size-4" /></span><div><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Signed in as')}</span><p className="font-semibold">{user.username}</p></div><Badge className="hidden sm:inline-flex" variant="success"><ShieldCheck aria-hidden="true" className="size-3" /> {t('Session protected')}</Badge></div>
          <Button disabled={submitting} variant="outline" onClick={() => void signOut()}><LogOut aria-hidden="true" className="size-4" /> {t('Sign out')}</Button>
          {error && <p className="basis-full rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  if (!showForm) return null

  return (
    <section className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-xl shadow-indigo-950/10" aria-labelledby="account-heading">
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-700 p-5 text-white sm:p-6">
        <span aria-hidden="true" className="absolute -right-10 -top-16 size-40 rounded-full bg-fuchsia-400/25 blur-2xl" />
        <span aria-hidden="true" className="absolute -bottom-20 -left-10 size-44 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="relative">
          <Badge className="border-white/20 bg-white/10 text-white shadow-none hover:bg-white/10"><Sparkles aria-hidden="true" className="size-3" /> {t('Evidence recorder')}</Badge>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{t('Proof for every packing handoff.')}</h2>
          <p className="mt-2 max-w-md text-sm leading-5 text-indigo-100">{t('Capture packing and unpacking evidence, verify every file, and keep each operational record accountable.')}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-indigo-50">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1"><FileCheck2 aria-hidden="true" className="size-3.5 text-cyan-300" />{t('File-level verification')}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1"><LockKeyhole aria-hidden="true" className="size-3.5 text-fuchsia-200" />{t('Private application storage')}</span>
          </div>
        </div>
      </div>
      <form autoComplete="on" className="space-y-3.5 p-5 sm:p-6" onSubmit={(event) => void submit(event)}>
        <CardHeader className="gap-1 p-0"><CardTitle id="account-heading">{t(mode === 'login' ? 'Sign in' : 'Create account')}</CardTitle><CardDescription>{t("LinhCj's records packing and unpacking evidence with private photos and videos.")}</CardDescription></CardHeader>
        <div className="space-y-1.5"><Label htmlFor="account-username">{t('Username')}</Label><Input defaultValue={rememberedUsername} id="account-username" name="username" minLength={3} maxLength={64} required autoComplete="username" placeholder="warehouse.operator" /></div>
        {mode === 'register' && <div className="space-y-1.5"><Label htmlFor="account-email">Email <span className="font-normal text-muted-foreground">({t('optional')})</span></Label><Input id="account-email" name="email" type="email" autoComplete="email" placeholder="operator@example.com" /></div>}
        <div className="space-y-1.5"><Label htmlFor="account-password">{t('Password')}</Label><Input id="account-password" name="password" type="password" minLength={6} maxLength={128} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={t('At least 6 characters')} /></div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm" htmlFor="account-remember"><input checked={rememberCredentials} className="mt-0.5 size-4 shrink-0 accent-primary" id="account-remember" type="checkbox" onChange={(event) => { setRememberCredentials(event.target.checked); if (!event.target.checked) { forgetRememberedUsername(); setRememberedUsername('') } }} /><span><span className="block font-medium text-foreground">{t('Remember username and password')}</span><span className="block text-xs leading-4 text-muted-foreground">{t('Your browser password manager stores the password securely.')}</span></span></label>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="grid gap-2"><Button className="w-full" disabled={submitting} type="submit">{submitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}{submitting ? t('Please wait…') : t(mode === 'login' ? 'Sign in' : 'Create account')}{!submitting && <ArrowRight aria-hidden="true" className="size-4" />}</Button><Button className="w-full" size="sm" type="button" variant="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{t(mode === 'login' ? 'Create an account' : 'Use an existing account')}</Button></div>
      </form>
    </section>
  )
}
