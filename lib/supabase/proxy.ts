import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = ['/', '/login', '/auth', '/assessment']

function isPublicPath(pathname: string) {
  if (pathname === '/') return true
  return PUBLIC_PREFIXES.slice(1).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value)
          })
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const pathname = request.nextUrl.pathname

  if (!claims && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (claims && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
