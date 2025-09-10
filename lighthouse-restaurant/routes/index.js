const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const { listFolder } = require('../utils/storage');

// Email transporter (uses environment variables)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Home page
router.get('/', async (req, res) => {
    try {
        // Fetch featured products from Supabase
        const { data: featuredProducts, error } = await req.app.locals.supabase
            .from('products')
            .select('*')
            .eq('is_featured', true)
            .order('created_at', { ascending: false })
            .limit(3);

        if (error) throw error;

        // Load site settings (single row)
        const { data: settingsRows } = await req.app.locals.supabase
            .from('site_settings')
            .select('*')
            .limit(1);
        const settings = settingsRows && settingsRows[0] ? settingsRows[0] : null;

        // Fallback to a published page ('inicio' or 'home') only for hero if settings missing
        let homePage = null;
        if (!settings || !settings.hero_image_url) {
            const { data: page1 } = await req.app.locals.supabase
                .from('pages')
                .select('*')
                .eq('slug', 'inicio')
                .eq('status', 'published')
                .maybeSingle();
            if (page1) {
                homePage = page1;
            } else {
                const { data: page2 } = await req.app.locals.supabase
                    .from('pages')
                    .select('*')
                    .eq('slug', 'home')
                    .eq('status', 'published')
                    .maybeSingle();
                if (page2) homePage = page2;
            }
        }

        const heroUrl = (settings && settings.hero_image_url)
            ? settings.hero_image_url
            : (homePage && homePage.hero_image_url) ? homePage.hero_image_url : '/images/hero-bg.jpg';

        // Prepare schedule list from JSON if provided
        let scheduleList = [];
        if (settings && settings.schedule_json) {
            try {
                const obj = JSON.parse(settings.schedule_json);
                scheduleList = Object.keys(obj).map(k => ({ day: k, hours: obj[k] }));
            } catch (e) {
                console.warn('Invalid schedule_json in site_settings');
            }
        }

        res.render('index', { 
            title: 'Inicio',
            featuredProducts: featuredProducts || [],
            homePage,
            heroUrl,
            settings,
            scheduleList
        });

// Public page by slug
router.get('/p/:slug', async (req, res, next) => {
    const { slug } = req.params;
    try {
        const { data, error } = await req.app.locals.supabase
            .from('pages')
            .select('*')
            .eq('slug', slug)
            .eq('status', 'published')
            .maybeSingle();
        if (error) throw error;
        if (!data) return next();
        res.render('page', { title: data.title, page: data });
    } catch (err) {
        return next(err);
    }
});
    } catch (error) {
        console.error('Error fetching featured products:', error);
        res.render('index', { 
            title: 'Inicio',
            featuredProducts: [],
            homePage: null,
            heroUrl: '/images/hero-bg.jpg',
            settings: null,
            scheduleList: []
        });
    }
});

// Menu page
router.get('/menu', async (req, res) => {
    try {
        // Fetch all menu categories
        const { data: categories, error: catError } = await req.app.locals.supabase
            .from('categories')
            .select('*')
            .order('sort_order', { ascending: true });

        if (catError) throw catError;

        // Fetch all products with their categories
        const { data: products, error: prodError } = await req.app.locals.supabase
            .from('products')
            .select('*')
            .order('name', { ascending: true });

        if (prodError) throw prodError;

        // Group products by category
        const menu = categories.map(category => ({
            ...category,
            items: products.filter(product => product.category_id === category.id)
        }));

        // List menu images from Storage bucket folder 'menu/'
        const listed = await listFolder('menu');
        const menuImages = listed.ok ? listed.files : [];

        res.render('menu', { 
            title: 'Menú',
            menu: menu,
            menuImages
        });
    } catch (error) {
        console.error('Error loading menu:', error);
        req.flash('error_msg', 'Error al cargar el menú. Por favor, intente de nuevo.');
        res.redirect('/');
    }
});

// About page
router.get('/about', (req, res) => {
    res.render('about', { 
        title: 'Sobre Nosotros' 
    });
});

// Contact page
router.get('/contact', (req, res) => {
    // Redirect to home contact section
    res.redirect('/#contacto');
});

// Handle contact form submission
router.post('/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;
    
    try {
        // Insert contact form submission into Supabase
        const { data, error } = await req.app.locals.supabase
            .from('contacts')
            .insert([
                { 
                    name, 
                    email, 
                    subject, 
                    message,
                    is_read: false
                }
            ]);

        if (error) throw error;

        // Send notification email
        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: 'hoshuacastillo48@gmail.com',
                subject: subject && subject.trim() ? `[Lighthouse] ${subject}` : '[Lighthouse] Nuevo mensaje de contacto',
                replyTo: email,
                text: `Nombre: ${name}\nEmail: ${email}\n\n${message}`,
                html: `<p><strong>Nombre:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Mensaje:</strong></p><p>${message?.replace(/\n/g,'<br>')}</p>`
            });
        } catch (mailErr) {
            console.error('Error sending contact email:', mailErr);
            // do not block user on email failure
        }

        req.flash('success_msg', '¡Mensaje enviado con éxito! Nos pondremos en contacto contigo pronto.');
        res.redirect('/#contacto');
    } catch (error) {
        console.error('Error submitting contact form:', error);
        req.flash('error_msg', 'Error al enviar el mensaje. Por favor, intente de nuevo.');
        res.redirect('/#contacto');
    }
});

module.exports = router;
