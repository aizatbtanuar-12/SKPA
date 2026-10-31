import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { setLang, useLang, type Lang } from '../lib/i18n'

/** BM | EN switch. Saved on the user's profile (so it follows them to other devices) and in this browser. */
export default function LangSwitch({ dark }: { dark?: boolean }) {
  const lang = useLang()
  const { profile } = useAuth()
  const pick = async (l: Lang) => {
    setLang(l)
    if (profile && profile.lang !== l) await supabase.from('profiles').update({ lang: l }).eq('id', profile.id)
  }
  return (
    <div className={`langsw ${dark ? 'dark' : ''}`} role="group" aria-label="Bahasa / Language" translate="no">
      <button type="button" className={lang === 'ms' ? 'on' : ''} aria-pressed={lang === 'ms'} onClick={() => pick('ms')}>BM</button>
      <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => pick('en')}>EN</button>
    </div>
  )
}
