require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const methodOverride = require('method-override');
const ejsLayouts = require('express-ejs-layouts');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();

// Initialize Supabase client (anon for client-like operations)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);

// Initialize privileged Supabase client for server-side operations (bypasses RLS)
const adminSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);

// Make supabase clients available in all routes
app.locals.supabase = supabase;
app.locals.adminSupabase = adminSupabase;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(ejsLayouts);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'lighthouse.sid'
}));

// Flash messages
app.use(flash());

// Global variables
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.user || null;
  next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
// Disable main layout for admin routes (admin views include their own full layout)
app.use('/admin', (req, res, next) => { res.locals.layout = false; next(); }, require('./routes/admin'));

// Add forgot-password route for backward compatibility
app.get('/forgot-password', (req, res) => {
  res.redirect('/auth/forgot-password');
});

// Add reset-password route for backward compatibility
app.get('/reset-password', (req, res) => {
  const { token } = req.query;
  if (token) {
    return res.redirect(`/auth/reset-password?token=${token}`);
  }
  res.redirect('/auth/forgot-password');
});

// 404 handler
app.use((req, res, next) => {
  const error = new Error('Página no encontrada');
  error.status = 404;
  next(error);
});

// Error handler
app.use((err, req, res, next) => {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Log the error
  console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
  console.error(err.stack);

  // Render the error page
  const status = err.status || 500;
  res.status(status).render(`error/${status}`, {
    title: status === 404 ? 'Página no encontrada' : 'Error del servidor',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = { app, supabase };
