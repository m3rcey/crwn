# CRWN Development Rules

**READ CODEBASE.md FIRST. Then follow these rules. No exceptions.**

## Before Writing Any Code
1. Read CODEBASE.md for exact table schemas and column locations
2. Check package.json before importing any library — if it's not listed, run `npm install <package>` first
3. Check existing components in src/components/ before creating duplicates

## Before Pushing
1. Run `npm run build` locally. If it fails, fix ALL errors before pushing.
2. Never push code that you haven't verified builds clean.

## TypeScript Rules
- When resetting form state with `setFormData({...})`, include EVERY field from the state type. Count them.
- Use `user?.id` not `user.id` — user can be null
- Recharts Tooltip formatter type: `(value: number | undefined) => formatCurrency(value || 0)`
- Supabase `.maybeSingle()` can return null — always handle the null case

## Database Rules
- `display_name` is on `profiles` table, NOT `artist_profiles`
- `slug` is on `artist_profiles` table, NOT `profiles`
- To get an artist's display name: query `profiles` WHERE `id = artist_profiles.user_id`
- ALL prices stored in cents (integer). Form input dollars * 100 = cents. Display cents / 100 = dollars.
- Soft-delete = set `is_active: false`, never hard delete

## RLS Rules
- Client-side Supabase uses anon key — respects RLS
- API routes can use service role key — bypasses RLS
- SELECT policies with `is_active = true` will hide soft-deleted items from the owner. Add owner override to SELECT policy.
- UPDATE policies need both USING and WITH CHECK if the update changes a column referenced in the SELECT policy

## Notification Pattern
- Artist notifications (from webhooks): use `notifyNewSubscriber/notifyNewPurchase/notifySubscriptionCanceled` from `@/lib/notifications` with supabaseAdmin
- Fan notifications (from client components): `fetch('/api/notifications/notify-subscribers', { method: 'POST', body: JSON.stringify({ artistId, type, title, message, link }) })`
- Get artist name from `profiles.display_name` via separate query, not from `artist_profiles`

## Stripe Rules  
- Prices on PLATFORM account, not connected account
- Subscriptions: `application_fee_percent: 8`
- One-time purchases: `application_fee_amount: Math.round(price * 0.08)`
- Always include metadata: `fan_id, artist_id, tier_id` (subscriptions) or `fan_id, artist_id, product_id` (purchases)

## File Patterns
- New dashboard tab: add to src/app/profile/artist/page.tsx tab list, create component in src/components/artist/
- New API route: src/app/api/[name]/route.ts
- New page: src/app/[name]/page.tsx
- SQL migrations: supabase/schema-phase2-[name].sql (DO NOT run, Josh runs manually)

## Common Mistakes to Avoid
- Importing a library that isn't in package.json
- Using `display_name` on `artist_profiles` (it doesn't exist there)
- Forgetting `maxQuantity` or any field in form state resets
- Creating Stripe prices on connected account instead of platform
- Using browser Supabase client in API routes (use service role)
- Not handling null from `.maybeSingle()`
- Pushing without running `npm run build`
