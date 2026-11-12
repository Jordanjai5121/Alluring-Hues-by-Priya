# Alluring Hues by Priya

Responsive handmade boutique storefront with a protected admin dashboard.

## Website
- Public storefront: `/`
- Admin dashboard: `/admin/`
- Static hosting: Vercel (Framework preset: Other; Build command blank; Output directory `.`).

## Supabase setup
1. In Supabase → Authentication → Users, create the admin user `alluringhuesbypriya@gmail.com` and set a password.
2. Open `supabase/admin_setup.sql` in the repository, copy it into Supabase SQL Editor, and run it. It creates the admin allow-list, admin RLS policies, and the public-read/admin-write `product-images` Storage bucket. It also adds the business email as an admin if that Auth user already exists.
3. Open Project Settings → API Keys. Copy the **publishable key** (or legacy anon key); never copy the `service_role` / secret key.
4. Edit `supabase-config.js` in GitHub and replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE` with the publishable key. Commit the change.
5. Open `/admin/`, connect using the same project URL and publishable key, then sign in with the admin email and password.

## Admin features
- Add, edit, activate/hide, and delete products.
- Upload JPEG, PNG, or WebP product images (maximum 5 MB each).
- Manage categories and display order.
- Review customer enquiries and update their status.
- Review website orders and update fulfilment status.

## Product catalogue and customer messages
The public storefront loads active categories and products from Supabase when `supabase-config.js` contains the publishable key. Without a key, the original sample catalogue remains as a fallback. Customer enquiries are stored in Supabase and also open WhatsApp. Checkout orders are submitted through the `place_order` RPC and then open WhatsApp with the order reference.

## Security
- The browser uses only the Supabase publishable/anon key.
- Admin membership is controlled by `public.admin_users`; RLS policies enforce access.
- Never place a Supabase `service_role` or secret key in frontend files.
- The WhatsApp flow is an enquiry/confirmation channel; the site does not process payments.

## Contact
Email: alluringhuesbypriya@gmail.com
Instagram: https://www.instagram.com/alluring_hues_by_priya/
WhatsApp: +91 88834 12455
