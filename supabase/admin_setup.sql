-- ==========================================================
-- ALLURING HUES BY PRIYA - ADMIN ACCESS + PRODUCT IMAGE STORAGE
-- Run this AFTER creating the admin login in Supabase Auth.
-- Safe to re-run: policies are dropped/recreated by name.
-- ==========================================================

-- 1) Admin allow-list. Only the SQL/database owner can add admins.
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated;

-- SECURITY DEFINER helper: the table itself is not exposed to browser users.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2) Admin permissions for catalogue management.
GRANT SELECT ON public.categories, public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories, public.products TO authenticated;

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories"
ON public.categories
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products"
ON public.products
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Existing public SELECT policies for active categories/products remain in place.

-- 3) Admin read/update access for enquiries.
GRANT SELECT, UPDATE ON public.enquiries TO authenticated;
DROP POLICY IF EXISTS "Admins read enquiries" ON public.enquiries;
CREATE POLICY "Admins read enquiries"
ON public.enquiries
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update enquiries" ON public.enquiries;
CREATE POLICY "Admins update enquiries"
ON public.enquiries
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Existing public INSERT enquiry policy remains in place.

-- 4) Admin read/update access for orders; order items are read-only in the dashboard.
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;

-- Remove the older direct public-insert policies if they still exist.
DROP POLICY IF EXISTS "Public can place orders" ON public.orders;
DROP POLICY IF EXISTS "Public can add order items" ON public.order_items;

DROP POLICY IF EXISTS "Admins read orders" ON public.orders;
CREATE POLICY "Admins read orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update orders" ON public.orders;
CREATE POLICY "Admins update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read order items" ON public.order_items;
CREATE POLICY "Admins read order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (public.is_admin());

-- 5) Product image bucket. Public URLs allow storefront visitors to view images.
INSERT INTO storage.buckets (
    id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
    'product-images',
    'product-images',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Admins upload product images" ON storage.objects;
CREATE POLICY "Admins upload product images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "Admins update product images" ON storage.objects;
CREATE POLICY "Admins update product images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'product-images'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;
CREATE POLICY "Admins delete product images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'product-images'
    AND public.is_admin()
);

-- 6) Add the business email as the first admin.
-- IMPORTANT: first create this user in Authentication > Users.
-- If the user does not exist yet, this INSERT adds zero rows.
INSERT INTO public.admin_users (user_id, email)
SELECT id, email
FROM auth.users
WHERE lower(email) = lower('alluringhuesbypriya@gmail.com')
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email;

-- Verify admin membership. Expect 1 row for the business email.
SELECT
    au.email,
    au.user_id,
    public.is_admin() AS is_admin_for_current_sql_session
FROM public.admin_users au
WHERE lower(au.email) = lower('alluringhuesbypriya@gmail.com');

-- ==========================================================
-- END
-- ==========================================================
