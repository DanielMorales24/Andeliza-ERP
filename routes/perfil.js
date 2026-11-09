// /perfil y /perfil/actividad: cualquier persona con sesión iniciada, sin permiso de módulo (es su propia información).
const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const C = require('../controllers/perfil');

const router = express.Router();

router.get('/', requireAuth, C.index);
router.get('/actividad', requireAuth, C.actividad);

module.exports = router;
