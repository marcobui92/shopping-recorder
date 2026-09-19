import { GoogleDriveConnection } from './GoogleDriveConnection'
import { type FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, LoaderCircle, LogOut, ShieldCheck, UserRound } from 'lucide-react'

import { ApiError, getSession, login, logout, registerAccount, type AppUser } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useI18n } from '../i18n'

export function AccountAccess({ onUserChange }: { onUserChange: (user: AppUser | null) => void }) {
  const { t } = useI18n()
  const [user, setUser] = useState<AppUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    void getSession().then((current) => {
      setUser(current)
      onUserChange(current)
    }).catch((reason: unknown) => {
      if (!(reason instanceof ApiError && reason.status === 401)) setError(reason instanceof Error ? reason.message : t('Unable to check the session.'))
      onUserChange(null)
    }).finally(() => setChecking(false))
  }, [onUserChange])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      const current = mode === 'register'
        ? await registerAccount({ email: String(data.get('email') ?? '').trim() || null, password: String(data.get('password') ?? ''), username: String(data.get('username') ?? '') })
        : await login({ password: String(data.get('password') ?? ''), username: String(data.get('username') ?? '') })
      setUser(current)
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
      setUser(null)
      onUserChange(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to sign out.'))
    } finally { setSubmitting(false) }
  }

  if (checking) return <Card><CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" /> {t('Checking your session…')}</CardContent></Card>

  if (user) {
    const profile = (
      <div className="relative">
        <Button aria-expanded={profileOpen} aria-haspopup="dialog" aria-label={t('Open profile')} className="grid size-10 !min-h-0 place-items-center rounded-full bg-primary p-0 text-primary-foreground shadow-sm" type="button" onClick={() => setProfileOpen((open) => !open)}><UserRound aria-hidden="true" className="size-5" /></Button>
        {profileOpen && <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border bg-card p-4 text-left shadow-xl" role="dialog" aria-label={t('Profile menu')}>
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><UserRound aria-hidden="true" className="size-5" /></span><div className="min-w-0"><span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Signed in as')}</span><p className="truncate font-semibold">{user.username}</p></div></div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" /> {t('Session protected')}</div>
          {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
          <GoogleDriveConnection />
          <Button className="mt-4 w-full" disabled={submitting} variant="outline" onClick={() => void signOut()}><LogOut aria-hidden="true" className="size-4" /> {t('Sign out')}</Button>
        </div>}
      </div>
    )
    const target = typeof document !== 'undefined' ? document.getElementById('header-profile') : null
    if (target) return createPortal(profile, target)
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-card to-accent/40">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"><UserRound aria-hidden="true" className="size-5" /></span><div><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Signed in as')}</span><p className="font-semibold">{user.username}</p></div><Badge className="hidden sm:inline-flex" variant="success"><ShieldCheck aria-hidden="true" className="size-3" /> {t('Session protected')}</Badge></div>
          <Button disabled={submitting} variant="outline" onClick={() => void signOut()}><LogOut aria-hidden="true" className="size-4" /> {t('Sign out')}</Button>
          {error && <p className="basis-full rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="grid overflow-hidden rounded-3xl border bg-card shadow-xl shadow-slate-900/5 lg:grid-cols-[1fr_1.05fr]" aria-labelledby="account-heading">
      <div className="relative overflow-hidden bg-slate-950 p-7 text-white sm:p-10">
        <div aria-hidden="true" className="absolute -right-20 -top-20 size-64 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative"><Badge className="border-white/10 bg-white/10 text-white">{t('Operator access')}</Badge><h2 className="mt-6 max-w-md text-3xl font-semibold tracking-tight sm:text-4xl" id="account-heading">{t(mode === 'login' ? 'Welcome back to your evidence workspace.' : 'Create your operator workspace.')}</h2><p className="mt-4 max-w-md leading-7 text-slate-300">{t('Every activity is linked to your account. Only you can review, correct, or remove the evidence you record.')}</p></div>
        <div className="relative mt-10 flex items-center gap-3 text-sm text-slate-300"><ShieldCheck aria-hidden="true" className="size-5 text-emerald-400" /> {t('Persistent, owner-authorized session')}</div>
      </div>
      <form className="space-y-5 p-7 sm:p-10" onSubmit={(event) => void submit(event)}>
        <CardHeader className="p-0"><CardTitle>{t(mode === 'login' ? 'Sign in' : 'Create account')}</CardTitle><CardDescription>{t(mode === 'login' ? 'Enter your operator credentials to continue.' : 'Email is optional and only used for account recovery.')}</CardDescription></CardHeader>
        <div className="space-y-2"><Label htmlFor="account-username">{t('Username')}</Label><Input id="account-username" name="username" minLength={3} maxLength={64} required autoComplete="username" placeholder="warehouse.operator" /></div>
        {mode === 'register' && <div className="space-y-2"><Label htmlFor="account-email">Email <span className="font-normal text-muted-foreground">({t('optional')})</span></Label><Input id="account-email" name="email" type="email" autoComplete="email" placeholder="operator@example.com" /></div>}
        <div className="space-y-2"><Label htmlFor="account-password">{t('Password')}</Label><Input id="account-password" name="password" type="password" minLength={6} maxLength={128} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={t('At least 6 characters')} /></div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button className="sm:min-w-36" disabled={submitting} size="lg" type="submit">{submitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}{submitting ? t('Please wait…') : t(mode === 'login' ? 'Sign in' : 'Create account')}{!submitting && <ArrowRight aria-hidden="true" className="size-4" />}</Button><Button type="button" variant="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{t(mode === 'login' ? 'Create an account' : 'Use an existing account')}</Button></div>
      </form>
    </section>
  )
}
