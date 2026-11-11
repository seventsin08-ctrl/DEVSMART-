-- DevMart — initial catalogue. Safe to re-run (idempotent on slug / name).
-- No customers, orders, revenue or testimonials are seeded: analytics start at zero.

insert into public.services (slug, name, short_description, description, features, icon,
                             starting_price_centavos, delivery_days_min, delivery_days_max, sort_order)
values
  ('personal-website', 'Personal Website',
   'A polished personal site, portfolio or online résumé.',
   'A fast, mobile-friendly personal website that introduces you professionally — ideal for freelancers, creatives, students and job seekers.',
   '["Up to 5 pages", "Mobile-first responsive design", "Contact form", "Basic SEO setup", "Social media links"]',
   'User', 500000, 5, 10, 1),
  ('business-website', 'Business Website',
   'A credible online home for your business.',
   'A professional company website with your services, gallery, location and inquiry forms so customers can find and trust your business.',
   '["Up to 8 pages", "Services & gallery sections", "Inquiry form with notifications", "Google Maps & business details", "SEO-ready structure"]',
   'Building2', 600000, 7, 14, 2),
  ('smart-ordering-system', 'Smart Ordering System',
   'Let customers order online, any time.',
   'An online ordering website for food, retail and service businesses with a product menu, cart, order management and status updates.',
   '["Product / menu catalogue", "Cart & checkout flow", "Order dashboard", "Order status updates", "Manual payment support (GCash, Maya, bank)"]',
   'ShoppingBag', 800000, 10, 21, 3),
  ('booking-system', 'Booking System',
   'Appointments and reservations without the back-and-forth.',
   'A booking platform for clinics, salons, resorts, rentals and studios with schedules, availability and an admin calendar.',
   '["Online booking calendar", "Availability & schedule rules", "Booking management dashboard", "Customer confirmations", "Manual payment support"]',
   'CalendarCheck', 1000000, 14, 28, 4),
  ('android-application', 'Android Application',
   'A custom Android app for your idea or business.',
   'A custom Android application designed around your workflow — from business tools to customer-facing apps — delivered ready to install.',
   '["Custom UI design", "Up to 8 core screens", "Online database", "User accounts", "APK / Play Store-ready build"]',
   'Smartphone', 1200000, 21, 35, 5),
  ('ios-android-application', 'iOS + Android Application',
   'One app, both platforms.',
   'A cross-platform mobile app for iPhone and Android built from a single codebase, so your customers get the same experience everywhere.',
   '["iOS and Android builds", "Custom UI design", "Up to 10 core screens", "User accounts & online database", "Store submission guidance"]',
   'TabletSmartphone', 1800000, 28, 45, 6)
on conflict (slug) do nothing;

insert into public.service_addons (service_id, name, description, price_centavos, sort_order)
select null, v.name, v.description, v.price, v.sort_order
from (values
  ('Domain & hosting setup', 'We register and connect your domain and hosting (provider fees not included).', 100000, 1),
  ('Logo design', 'A simple, modern logo with web-ready exports.', 150000, 2),
  ('Admin dashboard', 'A private dashboard to manage your content or records yourself.', 300000, 3),
  ('Online payment instructions page', 'GCash / Maya / bank instructions with payment proof upload.', 200000, 4),
  ('SEO starter setup', 'Search-friendly titles, descriptions, sitemap and Google Search Console setup.', 150000, 5),
  ('3 months maintenance', 'Content updates, fixes and monitoring for three months after launch.', 250000, 6)
) as v(name, description, price, sort_order)
where not exists (select 1 from public.service_addons a where a.name = v.name and a.service_id is null);

-- Payment methods start DISABLED and empty. Fill in your real account details in
-- Admin → Payments, then enable them.
insert into public.payment_methods (name, kind, instructions, is_active, sort_order)
select v.name, v.kind, v.instructions, false, v.sort_order
from (values
  ('GCash', 'gcash', 'Open GCash → Send Money, or scan the QR code. Enter the exact amount, then save a screenshot of the receipt.', 1),
  ('Maya', 'maya', 'Open Maya → Send Money, or scan the QR code. Enter the exact amount, then save a screenshot of the receipt.', 2),
  ('Bank Transfer', 'bank', 'Transfer through online banking or over the counter. Keep your deposit slip or a screenshot of the transfer confirmation.', 3)
) as v(name, kind, instructions, sort_order)
where not exists (select 1 from public.payment_methods m where m.name = v.name);

-- Concept showcases (clearly labelled as concepts, not client work). Replace them in Admin → Portfolio.
insert into public.portfolio_projects (slug, title, category, summary, description, tech, is_concept, is_featured, sort_order)
values
  ('concept-cafe-ordering', 'Café Ordering Concept', 'Smart Ordering System',
   'A mobile-first ordering flow for a neighbourhood café.',
   'A concept build showing menu browsing, cart, pickup scheduling and an order board for staff.',
   '["React", "Supabase", "Tailwind CSS"]', true, true, 1),
  ('concept-clinic-booking', 'Clinic Booking Concept', 'Booking System',
   'Appointment scheduling for a small clinic.',
   'A concept build showing doctor schedules, slot selection and a front-desk calendar.',
   '["React", "Supabase", "PostgreSQL"]', true, true, 2),
  ('concept-freelancer-portfolio', 'Freelancer Portfolio Concept', 'Personal Website',
   'A personal site for a creative freelancer.',
   'A concept build with project case studies, a services list and a contact form.',
   '["Vite", "React", "Motion"]', true, true, 3),
  ('concept-hardware-store', 'Hardware Store Website Concept', 'Business Website',
   'A catalogue-style website for a local store.',
   'A concept build with product categories, store location and inquiry forms.',
   '["React", "Tailwind CSS"]', true, false, 4),
  ('concept-delivery-app', 'Delivery Rider App Concept', 'Android Application',
   'An Android app for tracking deliveries.',
   'A concept build showing job lists, delivery status updates and proof of delivery.',
   '["React Native", "Supabase"]', true, false, 5),
  ('concept-fitness-app', 'Fitness Studio App Concept', 'iOS + Android Application',
   'Class booking for a fitness studio on iOS and Android.',
   'A concept build with class schedules, memberships and push-style reminders.',
   '["React Native", "Expo", "Supabase"]', true, false, 6)
on conflict (slug) do nothing;

insert into public.theme_settings (id) values (1) on conflict (id) do nothing;

-- Private operational settings (never sent to the public site).
insert into public.website_settings (key, draft, published) values
  ('operations',
   '{"deposit_percent": 50, "tracking_link_days": 30, "points_per_100_pesos": 1, "referral_bonus_points": 50}',
   '{"deposit_percent": 50, "tracking_link_days": 30, "points_per_100_pesos": 1, "referral_bonus_points": 50}')
on conflict (key) do nothing;
