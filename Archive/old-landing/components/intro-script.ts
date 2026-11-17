// Runs before paint: the intro plays once per tab and never under reduced motion.
// Sets html[data-intro] to "on" or "off". Kept out of intro.tsx so a server component can inline it.
export const INTRO_SCRIPT = `try{var h=document.documentElement,s=sessionStorage,off=s.getItem('rk_intro')||matchMedia('(prefers-reduced-motion: reduce)').matches;h.dataset.intro=off?'off':'on';s.setItem('rk_intro','1')}catch(e){document.documentElement.dataset.intro='off'}`;
