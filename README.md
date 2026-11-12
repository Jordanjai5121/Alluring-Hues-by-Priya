# Alluring Hues by Priya

Static responsive handmade boutique storefront.

## Run locally
Open `index.html` in a modern browser or run `python -m http.server 8000`.

## Deploy to Vercel
Import this GitHub repository in Vercel. Framework preset: Other. Build command: leave blank. Output directory: `.`.

## WhatsApp checkout
Order requests are enquiries sent to WhatsApp `+91 88834 12455`; this site does not take payments or automatically confirm orders.

## Product catalogue
The initial catalogue uses the supplied craft photographs and enquiry-only pricing. Edit the `PRODUCTS` array in the inline script in `index.html` to change product names, categories, image paths and descriptions. Prices are not invented.

## Contact
Email: alluringhuesbypriya@gmail.com
Instagram: https://www.instagram.com/alluring_hues_by_priya/

## Supabase
The current storefront can operate without Supabase. For a future admin-managed catalogue, create the database tables and enable Row Level Security. Only expose the anon/publishable key in browser code; never expose a service-role key.