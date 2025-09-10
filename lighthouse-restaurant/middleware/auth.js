// Middleware to check if user is authenticated
const checkAuthenticated = (req, res, next) => {
    console.log('Session data:', req.session); // Debug log
    
    if (req.session && req.session.user) {
        console.log('User is authenticated:', req.session.user.email);
        return next();
    }
    console.log('User not authenticated, redirecting to login');
    req.flash('error_msg', 'Por favor inicia sesión para acceder a esta página');
    res.redirect('/admin/login');
};

// Middleware to check if user is an admin
const checkAdmin = (req, res, next) => {
    console.log('Checking admin status for user:', req.session?.user?.email);
    
    if (req.session && req.session.user && req.session.user.isAdmin) {
        console.log('User is admin, granting access');
        return next();
    }
    
    console.log('Access denied: User is not an admin or not logged in');
    req.flash('error_msg', 'No tienes permiso para acceder a esta página');
    res.redirect(req.session?.user ? '/' : '/admin/login');
};

// Middleware to check if user is not authenticated (for login/register pages)
const checkNotAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        console.log('User already authenticated, redirecting to admin');
        return res.redirect('/admin');
    }
    console.log('User not authenticated, proceeding to login page');
    next();
};

module.exports = {
    checkAuthenticated,
    checkAdmin,
    checkNotAuthenticated
};
