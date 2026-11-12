-- ============================================================
-- ALLURING HUES BY PRIYA — CUSTOMER ACCOUNTS + ORDER OWNERSHIP
-- Run in Supabase SQL Editor after storefront_sync.sql.
-- ============================================================

-- Link each new order to the signed-in customer. Existing guest
-- orders remain unclaimed; do not assign them based on email/phone alone.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_recorded',
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('not_recorded','pending','paid','failed','refunded'));

CREATE INDEX IF NOT EXISTS orders_customer_created_idx
  ON public.orders(customer_id, created_at DESC);

-- Keep admin access from admin_setup.sql and restrict customers to their
-- own orders and order items. No public order reads are granted.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.orders, public.order_items TO authenticated;

DROP POLICY IF EXISTS "Customers read own orders" ON public.orders;
CREATE POLICY "Customers read own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers read own order items" ON public.order_items;
CREATE POLICY "Customers read own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.customer_id = auth.uid()
  )
);

-- Replace public order RPC with an authenticated ownership-aware version.
CREATE OR REPLACE FUNCTION public.place_order(
    p_order_number TEXT,
    p_customer_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_delivery_city TEXT,
    p_delivery_address TEXT,
    p_notes TEXT,
    p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order_id UUID;
    v_item_count INTEGER;
    v_valid_count INTEGER;
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Please sign in before placing an order';
    END IF;

    IF p_order_number IS NULL OR p_order_number !~ '^AHO-[A-Z0-9]{6}$' THEN
        RAISE EXCEPTION 'Invalid order reference';
    END IF;

    IF p_customer_name IS NULL
       OR pg_catalog.length(pg_catalog.btrim(p_customer_name)) NOT BETWEEN 2 AND 80 THEN
        RAISE EXCEPTION 'Invalid customer name';
    END IF;

    IF p_phone IS NULL
       OR pg_catalog.length(pg_catalog.btrim(p_phone)) NOT BETWEEN 5 AND 20 THEN
        RAISE EXCEPTION 'Invalid phone number';
    END IF;

    IF p_delivery_city IS NULL
       OR pg_catalog.length(pg_catalog.btrim(p_delivery_city)) NOT BETWEEN 2 AND 100 THEN
        RAISE EXCEPTION 'Invalid delivery city';
    END IF;

    IF p_delivery_address IS NULL
       OR pg_catalog.length(pg_catalog.btrim(p_delivery_address)) NOT BETWEEN 6 AND 500 THEN
        RAISE EXCEPTION 'Invalid delivery address';
    END IF;

    IF p_email IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(p_email)) > 254 THEN
        RAISE EXCEPTION 'Invalid email length';
    END IF;

    IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Items must be an array';
    END IF;

    v_item_count := pg_catalog.jsonb_array_length(p_items);
    IF v_item_count NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'Order must contain 1 to 50 items';
    END IF;

    SELECT pg_catalog.count(*)
    INTO v_valid_count
    FROM pg_catalog.jsonb_to_recordset(p_items)
        AS x(product_id UUID, product_name TEXT, quantity INTEGER)
    LEFT JOIN public.products p
        ON p.id = x.product_id
       AND p.is_active = TRUE
    WHERE x.quantity BETWEEN 1 AND 99
      AND (
          (x.product_id IS NOT NULL AND p.id IS NOT NULL)
          OR
          (x.product_id IS NULL
           AND pg_catalog.length(pg_catalog.btrim(COALESCE(x.product_name, ''))) BETWEEN 1 AND 200)
      );

    IF v_valid_count <> v_item_count THEN
        RAISE EXCEPTION 'One or more products are invalid or unavailable';
    END IF;

    INSERT INTO public.orders (
        customer_id, order_number, customer_name, phone, email,
        delivery_city, delivery_address, notes, payment_status
    )
    VALUES (
        v_uid,
        p_order_number,
        pg_catalog.btrim(p_customer_name),
        pg_catalog.btrim(p_phone),
        NULLIF(pg_catalog.btrim(COALESCE(p_email, '')), ''),
        pg_catalog.btrim(p_delivery_city),
        pg_catalog.btrim(p_delivery_address),
        NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''),
        'not_recorded'
    )
    RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (
        order_id, product_id, product_name, quantity
    )
    SELECT
        v_order_id,
        x.product_id,
        CASE WHEN p.id IS NOT NULL THEN p.name ELSE x.product_name END,
        x.quantity
    FROM pg_catalog.jsonb_to_recordset(p_items)
        AS x(product_id UUID, product_name TEXT, quantity INTEGER)
    LEFT JOIN public.products p
        ON p.id = x.product_id
       AND p.is_active = TRUE;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_order(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

-- IMPORTANT PAYMENT SECURITY:
-- payment_status/reference/method can be updated only by store admins
-- through the protected dashboard or a verified payment-provider webhook.
-- Do not store PAN, CVV, expiry, OTP, UPI PIN or net-banking passwords here.

SELECT
  to_regclass('public.orders') IS NOT NULL AS orders_table_exists,
  to_regclass('public.order_items') IS NOT NULL AS order_items_table_exists,
  to_regprocedure('public.place_order(text,text,text,text,text,text,text,jsonb)') IS NOT NULL
    AS authenticated_place_order_exists;
