import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/** Count of memos the signed-in user has not opened yet */
export function useUnreadMemos() {
  const { profile } = useAuth()
  const loc = useLocation()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('memos').select('id').limit(500),
      supabase.from('memo_reads').select('memo_id').eq('user_id', profile.id),
    ]).then(([m, r]) => {
      const read = new Set(((r.data ?? []) as { memo_id: number }[]).map((x) => x.memo_id))
      setN(((m.data ?? []) as { id: number }[]).filter((x) => !read.has(x.id)).length)
    })
  }, [profile, loc.pathname])
  return n
}
