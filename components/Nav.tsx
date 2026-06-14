'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/library', label: 'Library', icon: '▦' },
  { href: '/text', label: 'Text', icon: 'T' },
  { href: '/builder', label: 'Builder', icon: '⊞' },
  { href: '/generate', label: 'Generate', icon: '▶' },
  { href: '/gallery', label: 'Gallery', icon: '⊡' },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="w-48 shrink-0 border-r border-gray-100 bg-white flex flex-col py-8 px-4 gap-1">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-2 mb-6">
        UGC Studio
      </div>
      {links.map(({ href, label, icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${active
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
          >
            <span className="text-xs w-4 text-center opacity-70">{icon}</span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
