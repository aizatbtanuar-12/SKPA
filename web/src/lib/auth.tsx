import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile, type Settings, type ClassRow } from './supabase'
import type { Perm } from './perms'
import { getLang, setLang } from './i18n'

interface AuthState {
  session: Session | null
  profile: Profile | null
  settings: Settings | null
  classes: ClassRow[]
  familyId: number | null
  /** permissions of my role; null = access settings not installed yet (migration 010) */
  perms: Set<string> | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [familyId, setFamilyId] = useState<number | null>(null)
  const [perms, setPerms] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (s: Session | null) => {
    setError(null)
    if (!s) {
      setProfile(null); setSettings(null); setClasses([]); setFamilyId(null); setLoading(false)
      return
    }
    try {
      let p = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
      if (!p.error && !p.data) {
        // account created before the database was set up: create its profile now
        await supabase.rpc('ensure_my_profile')
        p = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
      }
      const [st, cl, fam] = await Promise.all([
        supabase.from('school_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('classes').select('*').eq('active', true).order('year_level').order('name'),
        supabase.rpc('my_family_id'),
      ])
      const firstErr = p.error ?? st.error ?? cl.error
      if (firstErr) throw new Error(firstErr.message)
      if (!p.data) throw new Error('Profil pengguna tidak dijumpai. Jalankan supabase/migrations/003_profile_repair.sql dalam Supabase SQL Editor.')
      setProfile(p.data as Profile)
      // the language saved on the profile wins over this browser's last choice
      const pl = (p.data as Profile).lang
      if (pl && pl !== getLang()) setLang(pl)
      // first sign-in after choosing a language on the sign-in page: remember it on the profile
      else if (!pl && getLang() === 'en') supabase.from('profiles').update({ lang: 'en' }).eq('id', s.user.id).then(() => {})
      setSettings((st.data as Settings) ?? null)
      setClasses((cl.data as ClassRow[]) ?? [])
      setFamilyId((fam.data as number | null) ?? null)
      const role = (p.data as Profile).role
      if (role === 'admin' || role === 'parent') setPerms(new Set())
      else {
        const rp = await supabase.from('role_permissions').select('perm').eq('role', role).eq('allowed', true)
        setPerms(rp.error ? null : new Set(((rp.data ?? []) as { perm: string }[]).map((x) => x.perm)))
      }
    } catch (e) {
      setProfile(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => { setSession(data.session); load(data.session) })
      .catch((e) => { setError(String(e)); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); load(s) })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value: AuthState = {
    session, profile, settings, classes, familyId, perms, loading, error,
    refresh: () => load(session),
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

export function useRole() {
  const { profile, classes, perms } = useAuth()
  const role = profile?.role ?? 'parent'
  /** committee: may view records (changes need a permission) */
  const isStaff = role === 'admin' || role === 'pengerusi' || role === 'bendahari' || role === 'pibg'
  const isAdmin = role === 'admin'
  const isTeacher = role === 'guru'
  const myClasses = classes.filter((c) => c.class_teacher_id === profile?.id)
  /** administrator-assigned permission (Tetapan → Akses pengguna). Before migration 010 the committee keeps full access. */
  const can = (p: Perm) => isAdmin || (perms ? perms.has(p) : isStaff)
  return {
    role, isStaff, isTeacher, myClasses, isAdmin, can,
    isParent: role === 'parent',
    /** parent functions (Anak Saya, Yuran, vote as a family): parents, and the PIBG committee / admin who are parents too */
    hasFamily: role === 'parent' || isStaff,
    isSchoolStaff: role !== 'parent',
    canPostMemo: can('memo_semua') || (isTeacher && myClasses.length > 0),
    canVerify: can('sahkan_murid') || myClasses.length > 0,
  }
}
