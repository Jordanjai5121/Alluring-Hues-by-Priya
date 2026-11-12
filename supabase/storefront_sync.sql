-- ==========================================================
-- ALLURING HUES BY PRIYA — STOREFRONT / ADMIN DATA SYNC
-- Run once in Supabase SQL Editor after the base tables and
-- admin_setup.sql have been created.
-- ==========================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS order_number TEXT;

UPDATE public.orders
SET order_number = 'AHO-' || upper(substr(replace(id::text, '-', ''), 1, 6))
WHERE order_number IS NULL;

ALTER TABLE public.orders
    ALTER COLUMN order_number
    SET DEFAULT ('AHO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)));

ALTER TABLE public.orders
    ALTER COLUMN order_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_uidx
    ON public.orders(order_number);

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.enquiries TO anon, authenticated;

DROP POLICY IF EXISTS "Public submit enquiries" ON public.enquiries;
DROP POLICY IF EXISTS "Public can submit enquiries" ON public.enquiries;

CREATE POLICY "Public submit enquiries"
ON public.enquiries
FOR INSERT
TO anon, authenticated
WITH CHECK (
    length(trim(name)) BETWEEN 2 AND 80
    AND length(trim(contact)) BETWEEN 5 AND 120
    AND length(trim(message)) BETWEEN 2 AND 2000
    AND status = 'new'
);

-- Let the public storefront distinguish an empty catalogue from a catalogue
-- whose products are all hidden. It reveals only a boolean, not product details.
CREATE OR REPLACE FUNCTION public.catalog_has_products()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
    SELECT EXISTS (SELECT 1 FROM public.products);
$;

REVOKE ALL ON FUNCTION public.catalog_has_products() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_has_products() TO anon, authenticated;

-- Orders and order items are created only through the secure RPC.
DROP POLICY IF EXISTS "Public can place orders" ON public.orders;
DROP POLICY IF EXISTS "Public can add order items" ON public.order_items;

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
BEGIN
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
        order_number, customer_name, phone, email,
        delivery_city, delivery_address, notes
    )
    VALUES (
        p_order_number,
        pg_catalog.btrim(p_customer_name),
        pg_catalog.btrim(p_phone),
        NULLIF(pg_catalog.btrim(COALESCE(p_email, '')), ''),
        NULLIF(pg_catalog.btrim(COALESCE(p_delivery_city, '')), ''),
        NULLIF(pg_catalog.btrim(COALESCE(p_delivery_address, '')), ''),
        NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '')
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
) TO anon, authenticated;

SELECT
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'order_number'
    ) AS order_number_column_exists,
    to_regprocedure('public.place_order(text,text,text,text,text,text,text,jsonb)') IS NOT NULL
        AS place_order_function_exists,
    to_regprocedure('public.catalog_has_products()') IS NOT NULL
        AS catalog_check_function_exists;
