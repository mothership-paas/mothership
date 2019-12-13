module.exports = {
  loginForm(req, res) {
    res.render('login', { layout: 'layout-external' });
  },

  login(req, res) {
    res.redirect('/')
  },

  logout(req, res) {
    req.logout();
    res.redirect('/login');
  },
}
