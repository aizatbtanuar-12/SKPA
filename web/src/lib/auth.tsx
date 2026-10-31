import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile, type Settings, type ClassRow } from './supabase'

interface AuthState {
  session: Session | null
  profile: Profile | null
  settings: Settings | null
  classes: ClassRow[]
  familyId: number | null
  loading: boolean
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
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null); setSettings(null); setClasses([]); setFamilyId(null); setLoading(false)
      return
    }
    const [p, st, cl, fam] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).single(),
      supabase.from('school_settings').select('*').eq('id', 1).single(),
      supabase.from('classes').select('*').eq('active', true).order('year_level').order('name'),
      supabase.rpc('my_family_id'),
    ])
    setProfile((p.data as Profile) ?? null)
    setSettings((st.data as Settings) ?? null)
    setClasses((cl.data as ClassRow[]) ?? [])
    setFamilyId((fam.data as number | null) ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); load(s) })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value: AuthState = {
    session, profile, settings, classes, familyId, loading,
    refresh: () => load(session),
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

export function useRole() {
  const { profile, classes } = useAuth()
  const role = profile?.role ?? 'parent'
  const isStaff = role === 'admin' || role === 'pibg'
  const isTeacher = role === 'guru'
  const myClasses = classes.filter((c) => c.class_teacher_id === profile?.id)
  return {
    role, isStaff, isTeacher, myClasses,
    isAdmin: role === 'admin',
    isParent: role === 'parent',
    isSchoolStaff: role !== 'parent',
    canPostMemo: isStaff || role === 'panitia' || (isTeacher && myClasses.length > 0),
    canVerify: isStaff || myClasses.length > 0,
  }
}
