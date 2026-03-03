# CRWN Codebase Reference

**READ THIS BEFORE WRITING ANY CODE. DO NOT SKIP.**

## Tech Stack
- Next.js 16 with TypeScript (Turbopack)
- Supabase (Postgres + Auth + Storage + Realtime)
- Stripe Connect (8% platform fee)
- Vercel deployment
- Tailwind CSS (dark mode)
- recharts for charts

## Critical Rules

### Prices Are In Cents
ALL prices in the database are stored in CENTS (integer). When displaying: `(price / 100).toFixed(2)`. When saving from form input: `Math.round(parseFloat(formData.price) * 100)`. NEVER store dollar amounts directly.

### Two Supabase Clients
1. **Client-side** (components): `import { createBrowserSupabaseClient } from '@/lib/supabase/client'` — respects RLS, uses anon key
2. **Server-side** (API routes/webhooks): Create with `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS. ONLY use in `/api/` routes.

### RLS Will Block You
- Client-side code runs as the authenticated user. If RLS policy doesn't allow it, the operation silently returns null/empty.
- Soft-deletes (`is_active: false`) can break SELECT policies that filter `is_active = true` — the artist can't see their own deactivated items. Fix: add `OR auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id)` to SELECT policies.
- Webhook inserts MUST use service role client (supabaseAdmin), not the browser client.

### TypeScript Form State
When a component has `useState<FormType>`, EVERY reset/set of that state MUST include ALL fields. Missing one field = build error. Before writing `setFormData({...})`, count the fields in the type definition and include all of them.

### Column Locations — DO NOT GUESS
| Column | Table | NOT on |
|--------|-------|--------|
| `display_name` | `profiles` | ~~artist_profiles~~ |
| `avatar_url` | `profiles` | ~~artist_profiles~~ |
| `slug` | `artist_profiles` | ~~profiles~~ |
| `banner_url` | `artist_profiles` | ~~profiles~~ |
| `stripe_connect_id` | `artist_profiles` | ~~profiles~~ |
| `user_id` | `artist_profiles` | (profiles uses `id` directly from auth.users) |
| `role` | `profiles` | ~~artist_profiles~~ |

To get artist display_name: query `profiles` by `user_id`, NOT `artist_profiles`.

### Imports That Exist
```typescript
// Supabase
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
// Stripe
import { stripe } from '@/lib/stripe/client';
// Notifications (server-side only)
import { notifyNewSubscriber, notifyNewPurchase, notifySubscriptionCanceled } from '@/lib/notifications';
// Fan notifications (client-side, call via fetch)
// POST /api/notifications/notify-subscribers { artistId, type, title, message, link }
// Icons
import { Loader2, Edit2, Trash2, X, Check, Bell } from 'lucide-react';
// Charts
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
```

### NPM Packages Installed
@aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @stripe/stripe-js, @supabase/ssr, @supabase/supabase-js, lucide-react, next, react, react-dom, recharts, stripe

**If you need a package not on this list, add it to package.json AND run `npm install` before using it.**

## Database Schema

### profiles
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | References auth.users(id) |
| role | TEXT | fan/artist/admin |
| display_name | TEXT | User's display name |
| avatar_url | TEXT | |
| bio | TEXT | |
| social_links | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### artist_profiles
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| user_id | UUID FK | References profiles(id) |
| slug | TEXT UNIQUE | URL slug |
| banner_url | TEXT | |
| tagline | TEXT | |
| stripe_connect_id | TEXT | |
| tier_config | JSONB | |
| is_verified | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### tracks
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| artist_id | UUID FK | References artist_profiles(id) |
| title | TEXT | |
| audio_url_128 | TEXT | Stream quality |
| audio_url_320 | TEXT | Premium quality |
| duration | INTEGER | Seconds |
| access_level | TEXT | free/subscriber/purchase |
| price | INTEGER | Cents, nullable |
| album_art_url | TEXT | |
| release_date | DATE | |
| play_count | INTEGER | Default 0 |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### subscription_tiers
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| artist_id | UUID FK | References artist_profiles(id) |
| name | TEXT | |
| price | INTEGER | Cents |
| description | TEXT | |
| access_config | JSONB | { benefits: string[] } |
| stripe_price_id | TEXT | |
| stripe_product_id | TEXT | |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### subscriptions
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| fan_id | UUID FK | References profiles(id) |
| artist_id | UUID FK | References artist_profiles(id) |
| tier_id | UUID FK | References subscription_tiers(id) |
| stripe_subscription_id | TEXT UNIQUE | |
| stripe_customer_id | TEXT | |
| status | TEXT | incomplete/active/past_due/canceled/paused |
| started_at | TIMESTAMPTZ | |
| current_period_start | TIMESTAMPTZ | |
| current_period_end | TIMESTAMPTZ | |
| canceled_at | TIMESTAMPTZ | |
| cancel_at_period_end | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### products
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| artist_id | UUID FK | References artist_profiles(id) |
| title | TEXT | |
| description | TEXT | |
| image_url | TEXT | |
| type | TEXT | digital/experience/bundle |
| price | INTEGER | Cents |
| access_level | TEXT | free/subscriber/public |
| delivery_type | TEXT | instant/scheduled/custom |
| file_url | TEXT | |
| duration_minutes | INTEGER | |
| max_quantity | INTEGER | nullable = unlimited |
| quantity_sold | INTEGER | Default 0 |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### purchases
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| fan_id | UUID FK | References profiles(id) |
| product_id | UUID FK | References products(id) |
| artist_id | UUID FK | References artist_profiles(id) |
| stripe_payment_intent_id | TEXT | |
| amount | INTEGER | Cents |
| status | TEXT | pending/completed/refunded |
| purchased_at | TIMESTAMPTZ | |
| notes | TEXT | |

### albums
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| artist_id | UUID FK | References artist_profiles(id) |
| title | TEXT | |
| description | TEXT | |
| album_art_url | TEXT | |
| release_date | DATE | |
| access_level | TEXT | free/subscriber |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### album_tracks
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| album_id | UUID FK | References albums(id) |
| track_id | UUID FK | References tracks(id) |
| track_number | INTEGER | |
| created_at | TIMESTAMPTZ | |

### playlists
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | References profiles(id) |
| title | TEXT | |
| description | TEXT | |
| cover_url | TEXT | |
| is_public | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### playlist_tracks
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| playlist_id | UUID FK | References playlists(id) |
| track_id | UUID FK | References tracks(id) |
| position | INTEGER | |
| added_at | TIMESTAMPTZ | |

### notifications
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | References profiles(id) |
| type | TEXT | new_subscriber/new_purchase/new_comment/subscription_canceled/new_track/new_post/new_shop_item |
| title | TEXT | |
| message | TEXT | |
| link | TEXT | |
| is_read | BOOLEAN | Default false |
| created_at | TIMESTAMPTZ | |

### posts
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| author_id | UUID FK | References profiles(id) |
| artist_community_id | UUID FK | References artist_profiles(id) |
| content | TEXT | |
| post_type | TEXT | text/image/video/audio/poll/link |
| media_urls | JSONB | |
| access_level | TEXT | free/subscriber/purchase |
| pinned | BOOLEAN | |
| highlighted | BOOLEAN | |
| poll_options | JSONB | |
| poll_results | JSONB | |
| link_url | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### play_history
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | References profiles(id) |
| track_id | UUID FK | References tracks(id) |
| played_at | TIMESTAMPTZ | |
| duration_played | INTEGER | Seconds |
| completed | BOOLEAN | |

### favorites
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | References profiles(id) |
| track_id | UUID FK | References tracks(id) |
| created_at | TIMESTAMPTZ | |

### Supabase Storage Buckets
- `audio` — track audio files
- `album-art` — album/track artwork and product images
- `avatars` — user profile pictures
- `community-media` — post media

## API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| /api/stripe/checkout | POST | Create subscription checkout session |
| /api/stripe/product-checkout | POST | Create one-time product purchase checkout |
| /api/stripe/create-price | POST | Create Stripe price on platform account |
| /api/stripe/connect | POST | Stripe Connect onboarding |
| /api/stripe/login-link | POST | Stripe Express dashboard link |
| /api/stripe/webhook | POST | Handle all Stripe webhook events |
| /api/notifications/notify-subscribers | POST | Notify all subscribers of an artist |

## Stripe Architecture
- Prices created on PLATFORM account (not connected account)
- Checkout uses `transfer_data.destination` for connected account
- 8% fee via `application_fee_percent` (subscriptions) or `application_fee_amount` (products)
- Webhook handles: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted

## Design System
- Background: #0D0D0D
- Cards/Surface: #1A1A1A
- Elevated: #2A2A2A
- Gold accent: #D4AF37
- Text primary: #FFFFFF
- Text secondary: #999999
- Error: red
- Font: Inter
- Mobile-first, responsive
