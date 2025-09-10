const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { uploadImage, ensureBucket, listFolder } = require('../utils/storage');
const { checkAuthenticated, checkAdmin } = require('../middleware/auth');

// Configure Multer memory storage (we'll upload to Supabase Storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Toggle Featured Product
router.post('/products/toggle-featured/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        // Get current value
        const { data: rows, error: selErr } = await req.app.locals.adminSupabase
            .from('products')
            .select('is_featured')
            .eq('id', id)
            .limit(1);
        if (selErr) throw selErr;
        const current = rows && rows[0] ? rows[0].is_featured : false;
        const { error: updErr } = await req.app.locals.adminSupabase
            .from('products')
            .update({ is_featured: !current, updated_at: new Date() })
            .eq('id', id);
        if (updErr) throw updErr;
        req.flash('success_msg', `Producto ${!current ? 'marcado' : 'desmarcado'} como destacado`);
    } catch (error) {
        console.error('Error toggling featured:', error);
        req.flash('error_msg', 'No se pudo cambiar el estado de destacado');
    }
    res.redirect('/admin/products');
});

// Menu Images Manager
router.get('/menu-images', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        await ensureBucket();
        const { ok, files } = await listFolder('menu');
        
        // Process files to include size and name
        const images = (ok ? files : []).map(file => ({
            ...file,
            name: file.name.replace(/^\d+_/, '').replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
            size: file.metadata?.size || 0
        }));
        
        res.render('admin/menu-images/index', {
            title: 'Imágenes del Menú',
            images: images || [],
            layout: 'admin'
        });
    } catch (error) {
        console.error('Error loading menu images:', error);
        req.flash('error_msg', 'Error al cargar las imágenes del menú');
        res.redirect('/admin/dashboard');
    }
});

// Upload Menu Image
router.post('/menu-images/upload', checkAuthenticated, checkAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No se ha seleccionado ninguna imagen');
        }

        const { name } = req.body;
        const result = await uploadImage({
            file: req.file,
            folder: 'menu',
            name: name ? name.replace(/[^a-z0-9 -]/gi, '_').substring(0, 50) : undefined
        });

        if (!result.ok) {
            throw new Error(result.error || 'Error al subir la imagen');
        }

        req.flash('success_msg', 'Imagen del menú subida correctamente');
    } catch (error) {
        console.error('Error uploading menu image:', error);
        req.flash('error_msg', `Error al subir la imagen: ${error.message}`);
    }
    res.redirect('/admin/menu-images');
});

// Delete Menu Image
router.post('/menu-images/delete', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { path } = req.body;
        if (!path) {
            throw new Error('Ruta de imagen no especificada');
        }

        const result = await deleteFile(path);
        if (!result.ok) {
            throw new Error(result.error || 'Error al eliminar la imagen');
        }

        req.flash('success_msg', 'Imagen eliminada correctamente');
    } catch (error) {
        console.error('Error deleting menu image:', error);
        req.flash('error_msg', `Error al eliminar la imagen: ${error.message}`);
    }
    res.redirect('/admin/menu-images');
});

// Media Manager
router.get('/media', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        await ensureBucket();
        const [hero, menu, products] = await Promise.all([
            listFolder('hero'),
            listFolder('menu'),
            listFolder('products')
        ]);
        res.render('admin/media/index', {
            title: 'Gestor de Medios',
            heroImages: hero.ok ? hero.files : [],
            menuImages: menu.ok ? menu.files : [],
            productImages: products.ok ? products.files : []
        });
    } catch (error) {
        console.error('Error loading media manager:', error);
        req.flash('error_msg', 'Error al cargar el gestor de medios');
        res.redirect('/admin');
    }
});

router.post('/media/upload', checkAuthenticated, checkAdmin, upload.single('file'), async (req, res) => {
    const { folder } = req.body;
    if (!req.file) {
        req.flash('error_msg', 'Debe seleccionar un archivo');
        return res.redirect('/admin/media');
    }
    try {
        await ensureBucket();
        const up = await uploadImage({ file: req.file, folder: folder || '' });
        if (!up.ok) throw new Error(up.error || 'Error al subir archivo');
        req.flash('success_msg', 'Archivo subido correctamente');
    } catch (error) {
        console.error('Error uploading media:', error);
        req.flash('error_msg', 'Error al subir el archivo');
    }
    res.redirect('/admin/media');
});

// Site Settings (single row)
router.get('/settings', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { data: rows, error } = await req.app.locals.adminSupabase
            .from('site_settings')
            .select('*')
            .limit(1);
        if (error) throw error;
        const hero = await listFolder('hero');
        res.render('admin/settings/form', {
            title: 'Ajustes del Sitio',
            settings: rows && rows[0] ? rows[0] : null,
            heroImages: hero.ok ? hero.files : []
        });
    } catch (error) {
        console.error('Error loading settings:', error);
        req.flash('error_msg', 'Error al cargar ajustes');
        res.redirect('/admin');
    }
});

router.post('/settings/save', checkAuthenticated, checkAdmin, async (req, res) => {
    const {
        id,
        hero_title,
        hero_subtitle,
        hero_image_url,
        historia_html,
        visitanos_html,
        schedule_json,
        address,
        map_embed_url,
        footer_html
    } = req.body;
    try {
        const payload = {
            hero_title: hero_title || null,
            hero_subtitle: hero_subtitle || null,
            hero_image_url: hero_image_url || null,
            historia_html: historia_html || null,
            visitanos_html: visitanos_html || null,
            schedule_json: schedule_json || null,
            address: address || null,
            map_embed_url: map_embed_url || null,
            footer_html: footer_html || null,
            updated_at: new Date()
        };
        let error;
        if (id) {
            const { error: upd } = await req.app.locals.adminSupabase
                .from('site_settings')
                .update(payload)
                .eq('id', id);
            error = upd;
        } else {
            payload.created_at = new Date();
            const { error: ins } = await req.app.locals.adminSupabase
                .from('site_settings')
                .insert([payload]);
            error = ins;
        }
        if (error) throw error;
        req.flash('success_msg', 'Ajustes guardados');
        res.redirect('/admin/settings');
    } catch (error) {
        console.error('Error saving settings:', error);
        req.flash('error_msg', 'Error al guardar ajustes');
        res.redirect('/admin/settings');
    }
});

router.post('/media/delete', checkAuthenticated, checkAdmin, async (req, res) => {
    const { path } = req.body;
    try {
        const { deleteFile } = require('../utils/storage');
        const result = await deleteFile(path);
        if (!result.ok) throw new Error(result.error);
        req.flash('success_msg', 'Archivo eliminado correctamente');
    } catch (error) {
        console.error('Error deleting media:', error);
        req.flash('error_msg', 'Error al eliminar el archivo');
    }
    res.redirect('/admin/media');
});

// Pages Management
// List pages
router.get('/pages', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { data: pages, error } = await req.app.locals.adminSupabase
            .from('pages')
            .select('*')
            .order('sort_order');
        if (error) throw error;
        res.render('admin/pages/index', { title: 'Gestionar Páginas', pages: pages || [] });
    } catch (error) {
        console.error('Error loading pages:', error);
        req.flash('error_msg', 'Error al cargar las páginas');
        res.redirect('/admin');
    }
});

// Add page form
router.get('/pages/add', checkAuthenticated, checkAdmin, async (req, res) => {
    const hero = await listFolder('hero');
    res.render('admin/pages/form', {
        title: 'Agregar Página',
        page: null,
        heroImages: hero.ok ? hero.files : []
    });
});

// Edit page form
router.get('/pages/edit/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { data: page, error } = await req.app.locals.adminSupabase
            .from('pages')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error) throw error;
        const hero = await listFolder('hero');
        res.render('admin/pages/form', {
            title: 'Editar Página',
            page,
            heroImages: hero.ok ? hero.files : []
        });
    } catch (error) {
        console.error('Error loading page:', error);
        req.flash('error_msg', 'Error al cargar la página');
        res.redirect('/admin/pages');
    }
});

// Save page
router.post('/pages/save', checkAuthenticated, checkAdmin, async (req, res) => {
    const { id, slug, title: ptitle, content, hero_image_url, status, sort_order } = req.body;
    try {
        if (!slug || !ptitle) {
            req.flash('error_msg', 'Slug y Título son requeridos');
            return res.redirect(`/admin/pages/${id ? 'edit/' + id : 'add'}`);
        }
        const payload = {
            slug: slug.trim(),
            title: ptitle.trim(),
            content: content || null,
            hero_image_url: hero_image_url || null,
            status: status || 'draft',
            sort_order: sort_order ? parseInt(sort_order) : 0,
            updated_at: new Date()
        };
        let error;
        if (id) {
            const { error: upd } = await req.app.locals.adminSupabase
                .from('pages')
                .update(payload)
                .eq('id', id);
            error = upd;
        } else {
            payload.created_at = new Date();
            const { error: ins } = await req.app.locals.adminSupabase
                .from('pages')
                .insert([payload]);
            error = ins;
        }
        if (error) throw error;
        req.flash('success_msg', `Página ${id ? 'actualizada' : 'creada'} exitosamente`);
        res.redirect('/admin/pages');
    } catch (error) {
        console.error('Error saving page:', error);
        req.flash('error_msg', `Error al ${id ? 'actualizar' : 'crear'} la página`);
        res.redirect(`/admin/pages/${id ? 'edit/' + id : 'add'}`);
    }
});

// Delete page
router.post('/pages/delete/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { error } = await req.app.locals.adminSupabase
            .from('pages')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        req.flash('success_msg', 'Página eliminada exitosamente');
    } catch (error) {
        console.error('Error deleting page:', error);
        req.flash('error_msg', 'Error al eliminar la página');
    }
    res.redirect('/admin/pages');
});

// Test route to verify routing is working
router.get('/test', (req, res) => {
    console.log('Test route hit!');
    res.send('Test route is working!');
});

// Admin Dashboard
router.get('/', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        // Get counts for dashboard
        const [
            productsCount,
            categoriesCount,
            messagesCount
        ] = await Promise.all([
            req.app.locals.supabase.from('products').select('*', { count: 'exact', head: true }),
            req.app.locals.supabase.from('categories').select('*', { count: 'exact', head: true }),
            req.app.locals.supabase.from('contacts').select('*', { count: 'exact', head: true })
        ]);

        // Get recent orders (you'll need to implement this table in Supabase)
        const { data: recentOrders } = await req.app.locals.supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        res.render('admin/dashboard', {
            title: 'Panel de Administración',
            productsCount: productsCount.count || 0,
            categoriesCount: categoriesCount.count || 0,
            messagesCount: messagesCount.count || 0,
            recentOrders: recentOrders || []
        });
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        req.flash('error_msg', 'Error al cargar el panel de administración');
        res.redirect('/');
    }
});

// Products Management
router.get('/products', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const [productsRes, categoriesRes] = await Promise.all([
            req.app.locals.adminSupabase
                .from('products')
                .select('*, categories(name)')
                .order('name'),
            req.app.locals.adminSupabase
                .from('categories')
                .select('*')
                .order('name')
        ]);

        const { data: products, error } = productsRes;
        const { data: categories, error: catError } = categoriesRes;

        if (error) throw error;
        if (catError) throw catError;

        res.render('admin/products/index', {
            title: 'Administrar Productos',
            products: products || [],
            categories: categories || []
        });
    } catch (error) {
        console.error('Error loading products:', error);
        req.flash('error_msg', 'Error al cargar los productos');
        res.redirect('/admin');
    }
});

// Add Product Form
router.get('/products/add', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { data: categories, error } = await req.app.locals.adminSupabase
            .from('categories')
            .select('*')
            .order('name');

        if (error) throw error;

        res.render('admin/products/form', {
            title: 'Agregar Producto',
            categories: categories || [],
            product: null
        });
    } catch (error) {
        console.error('Error loading add product form:', error);
        req.flash('error_msg', 'Error al cargar el formulario');
        res.redirect('/admin/products');
    }
});

// Edit Product Form
router.get('/products/edit/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { data: product, error: productError } = await req.app.locals.adminSupabase
            .from('products')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (productError) throw productError;
        if (!product) throw new Error('Producto no encontrado');

        const { data: categories, error: catError } = await req.app.locals.adminSupabase
            .from('categories')
            .select('*')
            .order('name');

        if (catError) throw catError;

        res.render('admin/products/form', {
            title: 'Editar Producto',
            product: product,
            categories: categories || []
        });
    } catch (error) {
        console.error('Error loading edit product form:', error);
        req.flash('error_msg', 'Error al cargar el producto');
        res.redirect('/admin/products');
    }
});

// Save Product (Create/Update)
router.post('/products/save', checkAuthenticated, checkAdmin, upload.single('image'), async (req, res) => {
    const { id, name, description, price, category_id, is_featured, is_available, sku, stock } = req.body;
    console.log('[products/save] Body:', JSON.stringify(req.body));
    if (req.file) {
        console.log('[products/save] Image received:', { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
    } else {
        console.log('[products/save] No image uploaded in this request');
    }
    
    try {
        // Basic validation
        const parsedPrice = parseFloat(String(price || '').replace(',', '.').trim());
        if (!name || !isFinite(parsedPrice)) {
            console.error('[products/save] Validation failed:', { name, price });
            req.flash('error_msg', 'Nombre y precio válidos son requeridos');
            return res.redirect(`/admin/products/${id ? 'edit/' + id : 'add'}`);
        }

        const productData = {
            name,
            description,
            price: parsedPrice,
            category_id: (category_id && category_id.trim() !== '') ? category_id : null,
            is_featured: is_featured === 'on',
            is_available: is_available === 'on',
            sku: sku || null,
            stock: typeof stock !== 'undefined' && stock !== '' ? parseInt(stock) : 0,
            updated_at: new Date()
        };
        console.log('[products/save] Prepared productData:', productData);

        // Note: PostgREST may not expose information_schema; we'll handle missing columns by retrying without them on error

        // Handle image upload to Supabase Storage
        if (req.file) {
            try {
                // Ensure default bucket exists and upload
                await ensureBucket();
                const up = await uploadImage({ file: req.file, folder: 'products' });
                if (!up.ok) {
                    throw new Error(up.error || 'Error al subir imagen');
                }
                productData.image_url = up.url;
                console.log('[products/save] Image uploaded to storage:', up);
            } catch (imgErr) {
                console.error('Error uploading image to storage:', imgErr);
                req.flash('error_msg', 'Error al subir la imagen del producto');
                return res.redirect(`/admin/products/${id ? 'edit/' + id : 'add'}`);
            }
        }

        let error;
        if (id) {
            // Update existing product
            const { data, error: updateError } = await req.app.locals.adminSupabase
                .from('products')
                .update(productData)
                .eq('id', id);
            error = updateError;
            console.log('[products/save] Update result:', { error: updateError });
        } else {
            // Create new product
            productData.created_at = new Date();
            const { data, error: insertError } = await req.app.locals.adminSupabase
                .from('products')
                .insert([productData]);
            error = insertError;
            console.log('[products/save] Insert result:', { error: insertError });
        }

        // Retry without sku/stock when schema cache complains
        if (error && (String(error.message || '').includes('stock') || String(error.message || '').includes('sku'))) {
            console.warn('[products/save] Retrying without sku/stock due to schema error');
            delete productData.sku;
            delete productData.stock;
            let retryError;
            if (id) {
                const { error: upd2 } = await req.app.locals.adminSupabase
                    .from('products')
                    .update(productData)
                    .eq('id', id);
                retryError = upd2;
                console.log('[products/save] Retry update result:', { error: upd2 });
            } else {
                productData.created_at = productData.created_at || new Date();
                const { error: ins2 } = await req.app.locals.adminSupabase
                    .from('products')
                    .insert([productData]);
                retryError = ins2;
                console.log('[products/save] Retry insert result:', { error: ins2 });
            }
            if (retryError) {
                console.error('[products/save] Supabase retry error details:', retryError);
                throw retryError;
            }
            error = null;
        }

        if (error) {
            console.error('[products/save] Supabase error details:', error);
            throw error;
        }

        req.flash('success_msg', `Producto ${id ? 'actualizado' : 'creado'} exitosamente`);
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error saving product:', error);
        const errMsg = error?.message || (error?.hint || error?.details) || 'Error desconocido';
        req.flash('error_msg', `Error al ${id ? 'actualizar' : 'crear'} el producto: ${errMsg}`);
        res.redirect(`/admin/products/${id ? 'edit/' + id : 'add'}`);
    }
});

// Delete Product
router.post('/products/delete/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { error } = await req.app.locals.adminSupabase
            .from('products')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success_msg', 'Producto eliminado exitosamente');
    } catch (error) {
        console.error('Error deleting product:', error);
        req.flash('error_msg', 'Error al eliminar el producto');
    }
    
    res.redirect('/admin/products');
});

// Categories Management - List
router.get('/categories', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { data: categories, error } = await req.app.locals.adminSupabase
            .from('categories')
            .select('*')
            .order('sort_order');

        if (error) throw error;

        res.render('admin/categories/index', {
            title: 'Administrar Categorías',
            categories: categories || []
        });
    } catch (error) {
        console.error('Error loading categories:', error);
        req.flash('error_msg', 'Error al cargar las categorías');
        res.redirect('/admin');
    }
});

// Categories - Add form
router.get('/categories/add', checkAuthenticated, checkAdmin, async (req, res) => {
    res.render('admin/categories/form', {
        title: 'Agregar Categoría',
        category: null
    });
});

// Categories - Edit form
router.get('/categories/edit/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { data: category, error } = await req.app.locals.adminSupabase
            .from('categories')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error) throw error;
        res.render('admin/categories/form', {
            title: 'Editar Categoría',
            category
        });
    } catch (error) {
        console.error('Error loading category:', error);
        req.flash('error_msg', 'Error al cargar la categoría');
        res.redirect('/admin/categories');
    }
});

// Categories - Save (Create/Update)
router.post('/categories/save', checkAuthenticated, checkAdmin, async (req, res) => {
    const { id, name, description, sort_order } = req.body;
    try {
        if (!name || !name.trim()) {
            req.flash('error_msg', 'El nombre de la categoría es requerido');
            return res.redirect(`/admin/categories/${id ? 'edit/' + id : 'add'}`);
        }
        const payload = {
            name: name.trim(),
            description: description || null,
            sort_order: sort_order ? parseInt(sort_order) : 0,
            updated_at: new Date()
        };
        let error;
        if (id) {
            const { error: upd } = await req.app.locals.adminSupabase
                .from('categories')
                .update(payload)
                .eq('id', id);
            error = upd;
        } else {
            payload.created_at = new Date();
            const { error: ins } = await req.app.locals.adminSupabase
                .from('categories')
                .insert([payload]);
            error = ins;
        }
        if (error) throw error;
        req.flash('success_msg', `Categoría ${id ? 'actualizada' : 'creada'} exitosamente`);
        res.redirect('/admin/categories');
    } catch (error) {
        console.error('Error saving category:', error);
        req.flash('error_msg', `Error al ${id ? 'actualizar' : 'crear'} la categoría`);
        res.redirect(`/admin/categories/${id ? 'edit/' + id : 'add'}`);
    }
});

// Categories - Delete
router.post('/categories/delete/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { error } = await req.app.locals.adminSupabase
            .from('categories')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        req.flash('success_msg', 'Categoría eliminada exitosamente');
    } catch (error) {
        console.error('Error deleting category:', error);
        req.flash('error_msg', 'Error al eliminar la categoría');
    }
    res.redirect('/admin/categories');
});

// Admin Login Form
router.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/admin');
    }
    res.render('admin/login', { 
        title: 'Iniciar Sesión',
        messages: req.flash()
    });
});

// Admin Login
router.post('/login', async (req, res, next) => {
    const { email, password } = req.body;
    
    try {
        console.log('\n=== Login Attempt ===');
        console.log('Email:', email);
        console.log('Request body:', JSON.stringify(req.body));
        
        if (!email || !password) {
            console.error('Missing email or password');
            req.flash('error_msg', 'Por favor ingrese correo y contraseña');
            return res.redirect('/admin/login');
        }
        
        // Find user by email
        console.log('\n[1/3] Searching for user in database...');
        const { data: user, error } = await req.app.locals.supabase
            .from('users')
            .select('*')
            .eq('email', email.trim().toLowerCase())  // Normalize email
            .single();
            
        if (error || !user) {
            console.error('❌ User not found or error:', error?.message || 'No user found');
            console.log('User object:', user);
            req.flash('error_msg', 'Credenciales incorrectas');
            return res.redirect('/admin/login');
        }
        
        console.log('✅ User found in database');
        console.log('User ID:', user.id);
        console.log('Stored password hash:', user.password.substring(0, 10) + '...');
        
        console.log('\n[2/3] Verifying password...');
        console.log('Password provided:', password ? 'Yes' : 'No');
        
        // Debug: Check the stored hash format
        console.log('Stored password hash format:', 
            user.password.startsWith('$2a$') ? 'bcrypt' : 'Unknown format');
        
        // Verify password using bcrypt
        let isMatch = false;
        try {
            isMatch = await bcrypt.compare(password, user.password);
            console.log('Password comparison result:', isMatch);
        } catch (bcryptError) {
            console.error('❌ Bcrypt comparison error:', bcryptError);
            req.flash('error_msg', 'Error al verificar la contraseña');
            return res.redirect('/admin/login');
        }
        
        if (!isMatch) {
            console.error('❌ Incorrect password for user:', email);
            
            // Debug: Show the first few characters of the stored hash
            console.log('Stored hash (first 20 chars):', user.password.substring(0, 20) + '...');
            
            // Debug: Hash the provided password with the same salt
            try {
                const saltRounds = 10;
                const salt = await bcrypt.genSalt(saltRounds);
                const hashedAttempt = await bcrypt.hash(password, salt);
                console.log('New hash with same salt:', hashedAttempt);
                
                // Try direct comparison if bcrypt.compare fails
                const directMatch = user.password === hashedAttempt;
                console.log('Direct hash comparison:', directMatch);
                
                // If direct match, update the user's password to the proper format
                if (directMatch) {
                    console.log('⚠️ Direct hash match - updating password format...');
                    const { error: updateError } = await req.app.locals.supabase
                        .from('users')
                        .update({ password: hashedAttempt })
                        .eq('id', user.id);
                    
                    if (updateError) {
                        console.error('Error updating password format:', updateError);
                    } else {
                        console.log('✅ Password format updated successfully');
                        // Set match to true since we verified the password
                        isMatch = true;
                    }
                }
            } catch (hashError) {
                console.error('Error generating hash for debug:', hashError);
            }
            
            if (!isMatch) {
                req.flash('error_msg', 'Credenciales incorrectas');
                return res.redirect('/admin/login');
            }
        }
        
        console.log('✅ Password verified successfully');
        
        // Check if user is admin
        if (!user.is_admin) {
            console.error('User is not an admin:', email);
            req.flash('error_msg', 'No tienes permiso para acceder al panel de administración');
            return res.redirect('/');
        }
        
        console.log('User authenticated, setting session...');
        
        // Set user in session
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.is_admin
        };
        
        // Save the session before redirecting
        req.session.save(err => {
            if (err) {
                console.error('Error saving session:', err);
                req.flash('error_msg', 'Error al iniciar sesión');
                return res.redirect('/admin/login');
            }
            console.log('Session saved, redirecting to admin dashboard');
            res.redirect('/admin');
        });
        
        return; // Important: Return to prevent further execution
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error_msg', 'Error al iniciar sesión');
        res.redirect('/admin/login');
    }
});

// Admin Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/admin');
        }
        res.clearCookie('lighthouse.sid');
        res.redirect('/admin/login');
    });
});

module.exports = router;
