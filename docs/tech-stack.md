# ugig.net - Tech Stack Details

## Core Framework

### Next.js 14+
- **App Router** - Server-first architecture
- **Server Components** - Default for all pages
- **Server Actions** - Form handling and mutations
- **Middleware** - Auth protection
- **API Routes** - Webhooks only

```bash
npx create-next-app@latest ugig.net --typescript --tailwind --app --src-dir
```

### TypeScript
- Strict mode enabled
- Full type coverage
- Shared types in `/types`

---

## Styling

### Tailwind CSS
- Utility-first CSS
- Custom design system
- Responsive design built-in

### shadcn/ui
- Pre-built accessible components
- Customizable with Tailwind
- No runtime overhead

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input ...
```

### Recommended Components
```bash
# Core UI
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add select
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add radio-group
npx shadcn-ui@latest add switch
npx shadcn-ui@latest add label

# Layout
npx shadcn-ui@latest add card
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add sheet
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu

# Feedback
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add badge

# Data Display
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add table

# Forms
npx shadcn-ui@latest add form
npx shadcn-ui@latest add calendar
npx shadcn-ui@latest add popover
npx shadcn-ui@latest add command
```

---

## Database & Backend

### Supabase

**Features Used**:
- PostgreSQL database
- Row Level Security (RLS)
- Authentication
- Realtime subscriptions
- Storage (file uploads)
- Edge Functions (optional)

**Client Setup**:

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}
```

```typescript
// lib/supabase/middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  await supabase.auth.getUser()
  return response
}
```

---

## Payments

### Stripe

**Libraries**:
```bash
npm install stripe @stripe/stripe-js
```

**Server-side**:
```typescript
// lib/stripe/index.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})
```

**Client-side**:
```typescript
// lib/stripe/client.ts
import { loadStripe } from '@stripe/stripe-js'

export const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)
```

---

## Video Calling

### Jitsi Meet

**Integration Options**:
1. **External API (Recommended)** - Embed via iframe
2. **React SDK** - More control but larger bundle

**Simple Integration**:
```typescript
// components/video/JitsiMeeting.tsx
'use client'

import { useEffect, useRef } from 'react'

interface JitsiMeetingProps {
  roomName: string
  displayName: string
  onClose?: () => void
}

export function JitsiMeeting({ roomName, displayName, onClose }: JitsiMeetingProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<any>(null)

  useEffect(() => {
    const domain = process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.jit.si'

    const options = {
      roomName,
      width: '100%',
      height: '100%',
      parentNode: containerRef.current,
      userInfo: {
        displayName,
      },
      configOverwrite: {
        startWithAudioMuted: true,
        startWithVideoMuted: false,
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'desktop', 'chat',
          'raisehand', 'participants-pane', 'hangup',
        ],
      },
    }

    // @ts-ignore
    apiRef.current = new JitsiMeetExternalAPI(domain, options)

    apiRef.current.addListener('readyToClose', () => {
      onClose?.()
    })

    return () => {
      apiRef.current?.dispose()
    }
  }, [roomName, displayName, onClose])

  return <div ref={containerRef} className="w-full h-full" />
}
```

**Load Script**:
```typescript
// app/layout.tsx
import Script from 'next/script'

// In layout:
<Script src="https://meet.jit.si/external_api.js" strategy="lazyOnload" />
```

---

## Forms

### React Hook Form + Zod

```bash
npm install react-hook-form @hookform/resolvers zod
```

**Example**:
```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const gigSchema = z.object({
  title: z.string().min(10).max(100),
  description: z.string().min(50).max(5000),
  category: z.string(),
  budget_type: z.enum(['fixed', 'hourly']),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
})

type GigFormData = z.infer<typeof gigSchema>

function GigForm() {
  const form = useForm<GigFormData>({
    resolver: zodResolver(gigSchema),
  })

  // ...
}
```

---

## State Management

### Approach

- **Server State**: Supabase + Server Components
- **Client State**: React Context (minimal)
- **Form State**: React Hook Form
- **Real-time**: Supabase Realtime subscriptions

### Auth Context Example

```typescript
// contexts/auth-context.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

---

## Additional Libraries

### Recommended

```bash
# Date handling
npm install date-fns

# Icons
npm install lucide-react

# Rich text editor (for gig descriptions)
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder

# Image handling
npm install sharp

# Email (if using custom email)
npm install resend

# Utilities
npm install clsx tailwind-merge
```

### Utility Functions

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatRelativeTime(date: string | Date) {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const diff = new Date(date).getTime() - Date.now()
  const days = Math.round(diff / (1000 * 60 * 60 * 24))

  if (Math.abs(days) < 1) {
    const hours = Math.round(diff / (1000 * 60 * 60))
    if (Math.abs(hours) < 1) {
      const minutes = Math.round(diff / (1000 * 60))
      return rtf.format(minutes, 'minute')
    }
    return rtf.format(hours, 'hour')
  }
  return rtf.format(days, 'day')
}
```

---

## Project Structure

```
ugig.net/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── layout.tsx
│   ├── (public)/
│   │   ├── gigs/
│   │   │   ├── [id]/page.tsx
│   │   │   └── page.tsx
│   │   ├── u/[username]/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx
│   │   ├── gigs/
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/edit/page.tsx
│   │   ├── applications/page.tsx
│   │   ├── messages/
│   │   │   ├── [id]/page.tsx
│   │   │   └── page.tsx
│   │   ├── calls/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── settings/page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   └── webhooks/stripe/route.ts
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/           # shadcn components
│   ├── forms/
│   ├── gigs/
│   ├── chat/
│   ├── video/
│   └── layout/
├── lib/
│   ├── supabase/
│   ├── stripe/
│   └── utils.ts
├── actions/          # Server actions
├── hooks/            # Custom hooks
├── types/            # TypeScript types
├── contexts/         # React contexts
├── docs/             # Documentation
├── public/
├── .env.example
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── todo.md
└── package.json
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "db:push": "supabase db push",
    "db:reset": "supabase db reset",
    "stripe:listen": "stripe listen --forward-to localhost:3000/api/webhooks/stripe"
  }
}
```
